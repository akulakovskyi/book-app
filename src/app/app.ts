import { Component, inject } from '@angular/core';
import { RouterOutlet, RouterLink } from '@angular/router';
import { LangSwitch } from './components/lang-switch';
import { I18n } from './services/i18n';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, LangSwitch],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly i18n = inject(I18n);
}
