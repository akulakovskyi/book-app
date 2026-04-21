import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { CheckboxModule } from 'primeng/checkbox';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { BookingApi } from '../../services/booking-api';
import { useT } from '../../services/i18n';

const CURRENCY_OPTIONS = [
  { label: 'EUR', value: 'EUR' },
  { label: 'USD', value: 'USD' },
  { label: 'GBP', value: 'GBP' },
  { label: 'UAH', value: 'UAH' },
];

@Component({
  selector: 'app-search-page',
  imports: [
    ReactiveFormsModule,
    InputTextModule,
    InputNumberModule,
    DatePickerModule,
    SelectModule,
    CheckboxModule,
    ButtonModule,
    MessageModule,
    IconFieldModule,
    InputIconModule,
  ],
  templateUrl: './search-page.html',
})
export class SearchPage {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(BookingApi);
  private readonly router = inject(Router);

  protected readonly t = useT();
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly currencyOptions = CURRENCY_OPTIONS;
  protected readonly submitLabel = computed(() =>
    this.loading() ? this.t('search.submitLoading') : this.t('search.submit'),
  );

  protected readonly form = (() => {
    const { checkIn, checkOut } = this.defaultSummerDates();
    return this.fb.nonNullable.group({
      destination: ['Amsterdam', [Validators.required, Validators.minLength(2)]],
      checkIn: [checkIn, Validators.required],
      checkOut: [checkOut, Validators.required],
      totalGuests: [8, [Validators.required, Validators.min(1), Validators.max(32)]],
      excludeHostels: [true],
      currency: ['EUR'],
      maxSplitUnits: [4],
      minUnitSize: [2],
    });
  })();

  submit(): void {
    if (this.form.invalid || this.loading()) return;
    this.loading.set(true);
    this.error.set(null);

    const raw = this.form.getRawValue();
    const payload = {
      ...raw,
      checkIn: toIsoDate(raw.checkIn),
      checkOut: toIsoDate(raw.checkOut),
    };
    this.api.search(payload).subscribe({
      next: (result) => {
        this.loading.set(false);
        this.router.navigate(['/results', result.id]);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message ?? err?.message ?? 'Search failed');
      },
    });
  }

  private defaultSummerDates(): { checkIn: Date; checkOut: Date } {
    const now = new Date();
    let year = now.getFullYear();
    const thisYearCheckOut = new Date(year, 6, 19);
    if (now > thisYearCheckOut) year += 1;
    const checkIn = new Date(year, 6, 16);
    const checkOut = new Date(year, 6, 19);
    checkIn.setHours(0, 0, 0, 0);
    checkOut.setHours(0, 0, 0, 0);
    return { checkIn, checkOut };
  }
}

function toIsoDate(value: Date | string): string {
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return value;
}
