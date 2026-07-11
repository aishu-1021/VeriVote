from rest_framework import serializers
from django.contrib.auth.models import User
from .models import Voter, EnrollmentOfficer
import base64
import sys
import os
class EnrollmentOfficerSerializer(serializers.ModelSerializer):
    class Meta:
        model  = EnrollmentOfficer
        fields = ['badge_number', 'constituency']


class VoterListSerializer(serializers.ModelSerializer):
    """Lightweight — used for the dashboard table."""
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model  = Voter
        fields = [
            'voter_id', 'full_name', 'assembly_constituency',
            'created_at', 'status', 'status_display'
        ]


class VoterDetailSerializer(serializers.ModelSerializer):
    """Full detail — used for enrollment form submission."""
    aadhaar_number  = serializers.CharField(write_only=True, max_length=12)
    fingerprint_b64 = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model  = Voter
        fields = [
            'voter_id',
            'full_name', 'date_of_birth', 'gender',
            'relative_name', 'relation',
            'mobile_number', 'email',
            'house_number', 'street', 'city', 'pincode',
            'state', 'district', 'assembly_constituency',
            'parliamentary_constituency', 'assigned_booth',
            'aadhaar_number',
            'aadhaar_hash',
            'passport_photo',
            'fingerprint_b64',
            'status', 'has_voted', 'created_at',
        ]
        read_only_fields = ['voter_id', 'aadhaar_hash', 'has_voted', 'created_at']

    def validate_aadhaar_number(self, value):
        value = value.replace(' ', '').replace('-', '')
        if not value.isdigit() or len(value) != 12:
            raise serializers.ValidationError("Aadhaar must be exactly 12 digits.")
        return value

    def validate_date_of_birth(self, value):
        from datetime import date
        today = date.today()
        age   = today.year - value.year - ((today.month, today.day) < (value.month, value.day))
        if age < 18:
            raise serializers.ValidationError("Voter must be at least 18 years old.")
        return value

    # ── Fingerprint duplicate check ───────────────────────────────────────────
    def _check_duplicate_fingerprint(self, new_fp_bytes: bytes):
        """
        Compare new fingerprint against all enrolled voters.

        Strategy:
          1. Try MFS100 MatchISO (scanner must be connected — it was just used)
          2. Fall back to exact bytes comparison (catches same template reused directly)

        Returns: (is_duplicate: bool, matched_voter_id: str | None)
        """
        existing_voters = Voter.objects.exclude(
            fingerprint_template=None
        ).exclude(fingerprint_template=b'')

        if not existing_voters.exists():
            return False, None

        # ── Try MFS100 ISO matching ───────────────────────────────────────────
        mfs_available = False
        mfs           = None
        try:
            import clr
            DLL_PATH   = r"C:\Program Files\Mantra\MFS100\Driver\MFS100Test\MANTRA.MFS100.dll"
            DLL_FOLDER = os.path.dirname(DLL_PATH)
            if DLL_FOLDER not in sys.path:
                sys.path.append(DLL_FOLDER)
            clr.AddReference(DLL_PATH)
            from MANTRA import MFS100
            import System
            mfs = MFS100()
            if mfs.IsConnected():
                result = mfs.Init()
                code   = result[0] if isinstance(result, tuple) else result
                if int(code) == 0:
                    mfs_available = True
                    print("[serializers] MFS100 available for duplicate fingerprint check")
        except Exception as e:
            print(f"[serializers] MFS100 not available for dup check: {e}")

        for voter in existing_voters:
            stored_bytes = bytes(voter.fingerprint_template)

            if mfs_available and mfs:
                # ── ISO minutiae matching ─────────────────────────────────────
                try:
                    import System
                    t1   = System.Array[System.Byte](list(new_fp_bytes))
                    t2   = System.Array[System.Byte](list(stored_bytes))
                    raw  = mfs.MatchISO(t1, t2, System.Int32(0))

                    if isinstance(raw, tuple):
                        err_code = int(raw[0])
                        score    = int(raw[1]) if len(raw) > 1 else 0
                    else:
                        err_code = 0
                        score    = int(raw)

                    if err_code == 0 and score >= 40:
                        print(f"[serializers] Duplicate fingerprint! voter={voter.voter_id} score={score}")
                        self._log_duplicate_fingerprint(voter.voter_id)
                        try: mfs.Uninit()
                        except: pass
                        return True, voter.voter_id

                except Exception as e:
                    print(f"[serializers] MatchISO error for {voter.voter_id}: {e}")

            else:
                # ── Fallback: exact bytes match ───────────────────────────────
                if new_fp_bytes == stored_bytes:
                    print(f"[serializers] Exact duplicate fingerprint bytes: voter={voter.voter_id}")
                    self._log_duplicate_fingerprint(voter.voter_id)
                    return True, voter.voter_id

        if mfs_available and mfs:
            try: mfs.Uninit()
            except: pass

        return False, None

    def _log_duplicate_fingerprint(self, matched_voter_id: str):
        """Create FraudAlert + blockchain block for duplicate fingerprint attempt."""
        try:
            from fraud_detection.models import FraudAlert
            FraudAlert.objects.create(
                alert_type='fingerprint_mismatch',
                voter_id='ENROLLMENT_ATTEMPT',
                booth_id='ENROLLMENT',
                description=(
                    f'Duplicate fingerprint detected during enrollment. '
                    f'Template matches existing voter: {matched_voter_id}. '
                    f'Possible impersonation or identity fraud attempt.'
                ),
                severity='high',
            )
            print(f"[serializers] FraudAlert created for duplicate fingerprint")
        except Exception as e:
            print(f"[serializers] FraudAlert creation failed: {e}")

        try:
            from audit_chain.chain import append_block
            append_block(
                event_type='DUPLICATE_FINGERPRINT_ENROLLMENT',
                data={
                    'matched_voter_id': matched_voter_id,
                    'stage':            'ENROLLMENT',
                    'action':           'REJECTED',
                    'reason':           'Fingerprint already registered to another voter.',
                }
            )
            print(f"[serializers] Blockchain block created for duplicate fingerprint")
        except Exception as e:
            print(f"[serializers] Blockchain log failed: {e}")

    # ── Create ────────────────────────────────────────────────────────────────
    def create(self, validated_data):
        raw_aadhaar     = validated_data.pop('aadhaar_number')
        fingerprint_b64 = validated_data.pop('fingerprint_b64', None)

        # Hash Aadhaar
        aadhaar_hash = Voter.hash_aadhaar(raw_aadhaar)

        # Check duplicate Aadhaar
        if Voter.objects.filter(aadhaar_hash=aadhaar_hash).exists():
            raise serializers.ValidationError(
                {"aadhaar_number": "A voter with this Aadhaar is already enrolled."}
            )

        # Decode fingerprint
        fingerprint_bytes = None
        if fingerprint_b64:
            fingerprint_bytes = base64.b64decode(fingerprint_b64)

        # ── CHECK DUPLICATE FINGERPRINT ───────────────────────────────────────
        if fingerprint_bytes:
            is_dup, matched_id = self._check_duplicate_fingerprint(fingerprint_bytes)
            if is_dup:
                raise serializers.ValidationError({
                    "fingerprint": (
                        f"Duplicate fingerprint detected! This fingerprint is already "
                        f"registered to voter {matched_id}. "
                        f"Enrollment rejected and fraud alert logged."
                    )
                })

        # All checks passed — save voter
        voter = Voter.objects.create(
            aadhaar_hash=aadhaar_hash,
            fingerprint_template=fingerprint_bytes,
            **validated_data
        )
        return voter