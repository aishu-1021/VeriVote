import hashlib
from django.db import models
def hash_aadhaar(raw_number: str) -> str:
    """SHA-256 hash of Aadhaar number. Used for all lookups."""
    return hashlib.sha256(raw_number.strip().encode()).hexdigest()


class AadhaarRecord(models.Model):
    """
    Simulated UIDAI Aadhaar database.
    Aadhaar number is stored as SHA-256 hash — never as plaintext.
    Photo is stored for face verification during voter enrollment.
    """
    aadhaar_hash   = models.CharField(max_length=64, unique=True)  # SHA-256 of raw number
    full_name      = models.CharField(max_length=200)
    date_of_birth  = models.DateField()
    gender         = models.CharField(max_length=10, choices=[
                       ('M', 'Male'), ('F', 'Female'), ('O', 'Other')
                     ])
    address        = models.TextField()
    photo          = models.ImageField(
                       upload_to='aadhaar_photos/',
                       null=True, blank=True,
                       help_text='Upload a clear face photo. Used for face verification during enrollment.'
                     )
    is_active      = models.BooleanField(default=True)
    created_at     = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.full_name} (hash: {self.aadhaar_hash[:10]}...)"

    class Meta:
        verbose_name        = "Aadhaar Record"
        verbose_name_plural = "Aadhaar Records"

    @classmethod
    def get_by_aadhaar(cls, raw_number: str):
        """Look up a record by raw Aadhaar number (hashes it internally)."""
        h = hash_aadhaar(raw_number)
        try:
            return cls.objects.get(aadhaar_hash=h, is_active=True)
        except cls.DoesNotExist:
            return None