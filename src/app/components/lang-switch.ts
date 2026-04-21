import { Component, inject } from '@angular/core';
import { I18n, type Lang } from '../services/i18n';

interface LangDef {
  code: Lang;
  flag: string;
  label: string;
}

const LANGS: LangDef[] = [
  { code: 'en', flag: '🇬🇧', label: 'EN' },
  { code: 'ua', flag: '🇺🇦', label: 'UA' },
];

@Component({
  selector: 'app-lang-switch',
  template: `
    <div class="inline-flex items-center overflow-hidden rounded-full border border-black/5 bg-white p-0.5 shadow-sm">
      @for (l of langs; track l.code) {
        <button
          type="button"
          (click)="set(l.code)"
          class="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider transition"
          [class.bg-black]="i18n.lang() === l.code"
          [class.text-white]="i18n.lang() === l.code"
          [class.rounded-full]="i18n.lang() === l.code"
          [class.text-neutral-500]="i18n.lang() !== l.code">
          <span class="text-[14px] leading-none">{{ l.flag }}</span>
          <span>{{ l.label }}</span>
        </button>
      }
    </div>
  `,
})
export class LangSwitch {
  protected readonly i18n = inject(I18n);
  protected readonly langs = LANGS;

  protected set(l: Lang): void {
    this.i18n.setLang(l);
  }
}
