from django import forms
from django.contrib import admin
from .models import AadhaarRecord, hash_aadhaar
class AadhaarAdminForm(forms.ModelForm):
    """
    Custom form that accepts raw Aadhaar number and hashes it automatically.
    """
    aadhaar_number_input = forms.CharField(
        max_length=12,
        required=False,
        label='Aadhaar Number (12 digits)',
        help_text='Enter raw 12-digit Aadhaar number. It will be hashed and stored securely. Leave blank if not changing.',
        widget=forms.TextInput(attrs={'placeholder': 'e.g. 234567891011'})
    )

    class Meta:
        model  = AadhaarRecord
        fields = '__all__'

    def clean(self):
        cleaned = super().clean()
        raw = cleaned.get('aadhaar_number_input', '').strip().replace(' ', '').replace('-', '')

        if raw:
            if len(raw) != 12 or not raw.isdigit():
                raise forms.ValidationError('Aadhaar number must be exactly 12 digits.')
            cleaned['aadhaar_hash'] = hash_aadhaar(raw)

        return cleaned

    def save(self, commit=True):
        instance = super().save(commit=False)
        raw = self.cleaned_data.get('aadhaar_number_input', '').strip()
        if raw:
            instance.aadhaar_hash = hash_aadhaar(raw)
        if commit:
            instance.save()
        return instance


@admin.register(AadhaarRecord)
class AadhaarAdmin(admin.ModelAdmin):
    form         = AadhaarAdminForm
    list_display = ('full_name', 'date_of_birth', 'gender', 'is_active', 'has_photo', 'created_at')
    list_filter  = ('gender', 'is_active')
    search_fields = ('full_name',)
    readonly_fields = ('aadhaar_hash', 'created_at')

    fieldsets = (
        ('🔐 Aadhaar Identity', {
            'fields': ('aadhaar_number_input', 'aadhaar_hash'),
            'description': 'Enter the raw Aadhaar number above. It is stored as a hash — the raw number is never saved.',
        }),
        ('👤 Personal Details', {
            'fields': ('full_name', 'date_of_birth', 'gender', 'address'),
        }),
        ('📷 Photo', {
            'fields': ('photo',),
            'description': 'Upload a clear face photo. Used for face verification during voter enrollment.',
        }),
        ('⚙️ Status', {
            'fields': ('is_active', 'created_at'),
        }),
    )

    def has_photo(self, obj):
        return '✅ Yes' if obj.photo else '❌ No'
    has_photo.short_description = 'Photo'