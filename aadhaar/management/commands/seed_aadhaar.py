"""
Management command: python manage.py seed_aadhaar
Creates 10 test Aadhaar records with hashed Aadhaar numbers.
Photos are NOT created here — upload real face photos via Django Admin.
"""
from datetime import date
from django.core.management.base import BaseCommand
from aadhaar.models import AadhaarRecord, hash_aadhaar

SEED_DATA = [
    {
        'aadhaar_number': '234567891011',
        'full_name':      'Rahul Sharma',
        'date_of_birth':  date(1990, 3, 15),
        'gender':         'M',
        'address':        '12, MG Road, Bangalore, Karnataka - 560001',
    },
    {
        'aadhaar_number': '345678910112',
        'full_name':      'Priya Nair',
        'date_of_birth':  date(1995, 7, 22),
        'gender':         'F',
        'address':        '45, Jayanagar 4th Block, Bangalore, Karnataka - 560041',
    },
    {
        'aadhaar_number': '456789101123',
        'full_name':      'Arjun Menon',
        'date_of_birth':  date(1988, 11, 5),
        'gender':         'M',
        'address':        '78, Koramangala 5th Block, Bangalore, Karnataka - 560095',
    },
    {
        'aadhaar_number': '567891011234',
        'full_name':      'Deepa Krishnan',
        'date_of_birth':  date(2000, 1, 30),
        'gender':         'F',
        'address':        '23, Indiranagar 100ft Road, Bangalore, Karnataka - 560038',
    },
    {
        'aadhaar_number': '678910112345',
        'full_name':      'Vikram Reddy',
        'date_of_birth':  date(1985, 6, 18),
        'gender':         'M',
        'address':        '56, Whitefield Main Road, Bangalore, Karnataka - 560066',
    },
    {
        'aadhaar_number': '789101123456',
        'full_name':      'Ananya Singh',
        'date_of_birth':  date(1998, 9, 12),
        'gender':         'F',
        'address':        '89, HSR Layout Sector 2, Bangalore, Karnataka - 560102',
    },
    {
        'aadhaar_number': '891011234567',
        'full_name':      'Suresh Kumar',
        'date_of_birth':  date(1975, 4, 25),
        'gender':         'M',
        'address':        '34, Rajajinagar 1st Block, Bangalore, Karnataka - 560010',
    },
    {
        'aadhaar_number': '910112345678',
        'full_name':      'Kavitha Rajan',
        'date_of_birth':  date(1992, 12, 8),
        'gender':         'F',
        'address':        '67, Electronic City Phase 1, Bangalore, Karnataka - 560100',
    },
    {
        'aadhaar_number': '101123456789',
        'full_name':      'Arun Patel',
        'date_of_birth':  date(1982, 8, 14),
        'gender':         'M',
        'address':        '12, BTM Layout 2nd Stage, Bangalore, Karnataka - 560076',
    },
    {
        'aadhaar_number': '112345678910',
        'full_name':      'Meera Iyer',
        'date_of_birth':  date(2003, 2, 20),
        'gender':         'F',
        'address':        '45, JP Nagar 6th Phase, Bangalore, Karnataka - 560078',
    },
]


class Command(BaseCommand):
    help = 'Seeds 10 test Aadhaar records (hashed numbers, no photos)'

    def handle(self, *args, **options):
        created = 0
        skipped = 0

        for entry in SEED_DATA:
            raw = entry.pop('aadhaar_number')
            h   = hash_aadhaar(raw)

            if AadhaarRecord.objects.filter(aadhaar_hash=h).exists():
                self.stdout.write(f"  ⏭  Skipping {entry['full_name']} (already exists)")
                skipped += 1
                continue

            AadhaarRecord.objects.create(aadhaar_hash=h, **entry)
            self.stdout.write(
                self.style.SUCCESS(f"  ✅ Created: {entry['full_name']} (Aadhaar: {raw[:4]}****{raw[-4:]})")
            )
            created += 1

        self.stdout.write(f'\nDone — {created} created, {skipped} skipped.')
        self.stdout.write(
            self.style.WARNING(
                '\nNEXT STEP: Go to Django Admin → Aadhaar Records → '
                'upload a real face photo for each person.\n'
                'Face matching will not work without real photos!'
            )
        )