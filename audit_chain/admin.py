from django.contrib import admin
from .models import Block

@admin.register(Block)
class BlockAdmin(admin.ModelAdmin):
    list_display = ('index', 'event_type', 'timestamp', 'hash')
    readonly_fields = ('index', 'event_type', 'data', 'hash', 'previous_hash', 'timestamp')