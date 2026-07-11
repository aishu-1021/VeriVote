from rest_framework.views import APIView
from rest_framework.response import Response
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from .models import AadhaarRecord, hash_aadhaar
from .face_utils import (
    decode_b64_image,
    load_image_from_path,
    compare_faces,
    check_duplicate_face_in_voters,
)
@method_decorator(csrf_exempt, name='dispatch')
class AadhaarVerifyView(APIView):
    """
    POST /api/aadhaar/verify/
    Body: {
        "aadhaar_number": "XXXXXXXXXXXX",
        "photo_b64": "data:image/jpeg;base64,..."   ← webcam capture
    }

    Returns verification result including:
    - Whether Aadhaar number exists
    - Whether face matches Aadhaar photo
    - Whether face already exists in voter DB (duplicate check)
    - Auto-fill data (name, dob, gender) for the enrollment form
    """

    def post(self, request):
        raw_aadhaar = request.data.get('aadhaar_number', '').strip().replace(' ', '').replace('-', '')
        photo_b64   = request.data.get('photo_b64', '')

        # ── Step 1: Validate format ───────────────────────────────────────────
        if not raw_aadhaar or len(raw_aadhaar) != 12 or not raw_aadhaar.isdigit():
            return Response({
                'valid':  False,
                'reason': 'Invalid Aadhaar number. Must be exactly 12 digits.'
            }, status=400)

        # ── Step 2: Look up by hash ───────────────────────────────────────────
        record = AadhaarRecord.get_by_aadhaar(raw_aadhaar)
        if not record:
            return Response({
                'valid':  False,
                'reason': 'Aadhaar number not found in UIDAI database.'
            })

        # ── Step 3: Check already enrolled as voter ───────────────────────────
        from voters.models import Voter
        if Voter.objects.filter(aadhaar_hash=Voter.hash_aadhaar(raw_aadhaar)).exists():
            return Response({
                'valid':  False,
                'reason': 'This Aadhaar is already registered as a voter.'
            })

        # ── Step 4: Face match — webcam vs Aadhaar photo ─────────────────────
        face_match  = None
        face_score  = None
        face_reason = ''

        if photo_b64:
            if record.photo:
                try:
                    webcam_img  = decode_b64_image(photo_b64)
                    aadhaar_img = load_image_from_path(record.photo.path)

                    if webcam_img is not None and aadhaar_img is not None:
                        face_match, face_score = compare_faces(
                            webcam_img, aadhaar_img, threshold=0.45
                        )
                        face_reason = (
                            f'Face score: {face_score:.2f} — '
                            f'{"MATCH ✅" if face_match else "MISMATCH ❌"}'
                        )
                    else:
                        face_reason = 'Could not process image.'
                except Exception as e:
                    face_reason = f'Face check error: {e}'
            else:
                face_reason = 'No photo in Aadhaar record — face check skipped.'

        # ── Step 5: Duplicate face check against existing voters ──────────────
        duplicate_voter    = False
        duplicate_voter_id = None

        if photo_b64:
            try:
                webcam_img = decode_b64_image(photo_b64)
                if webcam_img is not None:
                    duplicate_voter, duplicate_voter_id = check_duplicate_face_in_voters(
                        webcam_img, threshold=0.90
                    )
            except Exception as e:
                print(f'[AadhaarVerify] Duplicate check error: {e}')

        # ── Step 6: Return result ─────────────────────────────────────────────
        return Response({
            'valid':              True,
            'name':               record.full_name,
            'dob':                record.date_of_birth.strftime('%Y-%m-%d'),
            'gender':             record.gender,
            'address':            record.address,
            'face_match':         face_match,
            'face_score':         face_score,
            'face_reason':        face_reason,
            'duplicate_voter':    duplicate_voter,
            'duplicate_voter_id': duplicate_voter_id,
            'reason': (
                f'Duplicate face — already enrolled as {duplicate_voter_id}.'
                if duplicate_voter
                else 'Aadhaar verified successfully.'
            ),
        })