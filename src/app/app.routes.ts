import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/search/search-page').then((m) => m.SearchPage),
  },
  {
    path: 'results/:id',
    loadComponent: () =>
      import('./pages/results/results-page').then((m) => m.ResultsPage),
  },
];
