import { Injectable, PLATFORM_ID, effect, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type Lang = 'en' | 'ua';

const STORAGE_KEY = 'booking-app.lang';

const dict = {
  en: {
    'app.brand': 'booking.app',
    'app.tagline': 'personal trip comparator',

    'search.title': 'Plan a group trip',
    'search.subtitle1': 'Live options from Booking and Airbnb.',
    'search.subtitle2': 'Best splits, ranked by price per person.',
    'search.destination': 'Destination',
    'search.destinationPlaceholder': 'Barcelona, Lisbon, Krakow…',
    'search.checkIn': 'Check in',
    'search.checkOut': 'Check out',
    'search.guests': 'Guests',
    'search.maxUnits': 'Max units',
    'search.minUnit': 'Min unit size',
    'search.currency': 'Currency',
    'search.excludeHostels': 'Exclude hostels',
    'search.submit': 'Find best options',
    'search.submitLoading': 'Searching… may take a minute',
    'search.footerPrivacy': 'runs locally and privately',
    'search.footerPdf': 'exports to PDF',
    'search.badge': 'Booking + Airbnb',

    'results.new': 'New',
    'results.report': 'Print report',
    'results.plan': 'Your plan',
    'results.listing': 'listing',
    'results.listings': 'listings',
    'results.capacity': 'capacity',
    'results.clear': 'Clear plan',
    'results.fitsExactly': 'Fits exactly',
    'results.guests': 'guests',
    'results.withoutBed': 'guests without bed',
    'results.spareSpots': 'spare spots',
    'results.spareSpot': 'spare spot',
    'results.perPerson': '/ person',
    'results.pp': '/ pp',
    'results.recommendedShapes': 'Recommended shapes',
    'results.sortedByPP': 'sorted by price per person',
    'results.bestValue': 'best value',
    'results.shape': 'Shape',
    'results.alternative': 'alternative',
    'results.alternatives': 'alternatives',
    'results.from': 'from',
    'results.alt': 'Alt',
    'results.buildYourOwn': 'Build your own',
    'results.buildYourOwnSubtitle': 'Top 10 cheapest per platform for each size. Tap + to add to your plan.',
    'results.sort': 'Sort',
    'results.forGuests': 'guests',
    'results.noListings': 'No listings with prices.',
    'results.loading': 'Loading comparison…',
    'results.notFound': 'Not found',
    'results.newSearch': 'new search',
    'results.noSplits': 'No valid splits. Try different dates or guest count.',
    'results.night': 'night',
    'results.nights': 'nights',
    'results.remove': 'Remove from plan',
    'results.add': 'Add to plan',
    'results.showMore': 'Show more',
    'results.showLess': 'Collapse',
    'results.showingOf': 'of',
    'results.tabShapes': 'Recommended',
    'results.tabCustom': 'Build your own',
    'results.emptyPlanTitle': 'Empty plan',
    'results.emptyPlanBody': 'Tap + on any listing below to add it. This card will show your selected stays, total capacity vs. your group size, and combined price.',
    'results.planHint': 'Mix and match any Booking or Airbnb listing. Capacity and total update live.',
    'results.fetchMore': 'Fetch more',
    'results.fetchMoreHint': 'Scrapes a new page live — can take 20–40s',
    'results.fetching': 'Fetching…',
    'results.fetchedAll': 'All available results loaded',
    'results.mapTitle': 'Where they are',
    'results.mapHint': 'Add listings to your plan to see them pinned here.',
    'results.mapLegend': 'Blue: Booking · Red: Airbnb',
    'results.filters': 'Filters',
    'results.filterDistance': 'Max distance',
    'results.filterRating': 'Min rating',
    'results.filterPrice': 'Max / night',
    'results.filterClear': 'Clear',
    'results.filtersActive': 'filters active',
    'results.showBrowseOnMap': 'Show filtered on map',
    'results.matchingCount': 'match',
    'results.matchingCountOf': 'of',
    'results.needCoords': 'Listings without known coords are always shown.',
    'results.geocodingMany': 'Resolving locations…',
    'results.sortByClosest': 'Closest units first',
    'results.altsMapTitle': 'Selected alternative on map',
    'results.altsMapHint': 'Pick any alternative to see its units and the distance between them.',
    'results.distanceBetween': 'between',
    'results.viewOnMap': 'View on map',
    'results.hideMap': 'Hide map',
    'results.mapNote': 'Pins may take a few seconds to appear — coordinates are resolved on demand.',

    'sort.priceAsc': 'Price (low → high)',
    'sort.priceDesc': 'Price (high → low)',
    'sort.ratingDesc': 'Rating (high → low)',
  },
  ua: {
    'app.brand': 'booking.app',
    'app.tagline': 'персональний планувальник поїздок',

    'search.title': 'Поїздка групою',
    'search.subtitle1': 'Живі варіанти з Booking і Airbnb.',
    'search.subtitle2': 'Найкращі розбиття, сортовані за ціною на людину.',
    'search.destination': 'Куди',
    'search.destinationPlaceholder': 'Барселона, Лісабон, Краків…',
    'search.checkIn': 'Заїзд',
    'search.checkOut': 'Виїзд',
    'search.guests': 'Гостей',
    'search.maxUnits': 'Макс. юнітів',
    'search.minUnit': 'Мін. розмір',
    'search.currency': 'Валюта',
    'search.excludeHostels': 'Без хостелів',
    'search.submit': 'Знайти варіанти',
    'search.submitLoading': 'Шукаю… до хвилини',
    'search.footerPrivacy': 'локально та приватно',
    'search.footerPdf': 'звіт у PDF',
    'search.badge': 'Booking + Airbnb',

    'results.new': 'Новий',
    'results.report': 'Звіт для друку',
    'results.plan': 'Твій план',
    'results.listing': 'варіант',
    'results.listings': 'варіантів',
    'results.capacity': 'місць',
    'results.clear': 'Очистити план',
    'results.fitsExactly': 'Точно на',
    'results.guests': 'гостей',
    'results.withoutBed': 'без ліжка',
    'results.spareSpots': 'вільних місць',
    'results.spareSpot': 'вільне місце',
    'results.perPerson': '/ на людину',
    'results.pp': '/ л.',
    'results.recommendedShapes': 'Рекомендовані розбиття',
    'results.sortedByPP': 'сортовано за ціною на людину',
    'results.bestValue': 'найкраще',
    'results.shape': 'Варіант',
    'results.alternative': 'альтернатива',
    'results.alternatives': 'альтернатив',
    'results.from': 'від',
    'results.alt': 'Вар.',
    'results.buildYourOwn': 'Склади свій план',
    'results.buildYourOwnSubtitle': 'Топ-10 найдешевших по кожній платформі для кожного розміру. Тапни +, щоб додати до плану.',
    'results.sort': 'Сортування',
    'results.forGuests': 'гостей',
    'results.noListings': 'Немає варіантів з цінами.',
    'results.loading': 'Завантажую…',
    'results.notFound': 'Не знайдено',
    'results.newSearch': 'новий пошук',
    'results.noSplits': 'Немає жодного варіанта. Спробуй інші дати або кількість гостей.',
    'results.night': 'ніч',
    'results.nights': 'ночей',
    'results.remove': 'Прибрати з плану',
    'results.add': 'Додати до плану',
    'results.showMore': 'Показати ще',
    'results.showLess': 'Згорнути',
    'results.showingOf': 'з',
    'results.tabShapes': 'Рекомендовані',
    'results.tabCustom': 'Склади свій',
    'results.emptyPlanTitle': 'План порожній',
    'results.emptyPlanBody': 'Натискай + на будь-якому варіанті нижче, щоб додати його. Тут зʼявиться список обраних, сумарна місткість і ціна — у реальному часі.',
    'results.planHint': 'Мікс з будь-яких Booking і Airbnb. Місткість і сума оновлюються автоматично.',
    'results.fetchMore': 'Дозавантажити',
    'results.fetchMoreHint': 'Буде зроблено новий скрейп — до 20–40 сек',
    'results.fetching': 'Завантажую…',
    'results.fetchedAll': 'Це всі доступні результати',
    'results.mapTitle': 'Де вони на мапі',
    'results.mapHint': 'Додай варіанти до плану, щоб побачити їх на мапі.',
    'results.mapLegend': 'Синій: Booking · Червоний: Airbnb',
    'results.filters': 'Фільтри',
    'results.filterDistance': 'Макс. відстань',
    'results.filterRating': 'Мін. рейтинг',
    'results.filterPrice': 'Макс. / ніч',
    'results.filterClear': 'Скинути',
    'results.filtersActive': 'активні',
    'results.showBrowseOnMap': 'Показати відфільтровані на мапі',
    'results.matchingCount': 'варіантів',
    'results.matchingCountOf': 'з',
    'results.needCoords': 'Варіанти без координат показуються завжди.',
    'results.geocodingMany': 'Визначаю локації…',
    'results.sortByClosest': 'Спочатку найближчі',
    'results.altsMapTitle': 'Обраний варіант на мапі',
    'results.altsMapHint': 'Тапни на будь-який варіант, щоб побачити юніти та відстань між ними.',
    'results.distanceBetween': 'між юнітами',
    'results.viewOnMap': 'На мапі',
    'results.hideMap': 'Сховати мапу',
    'results.mapNote': 'Маркери можуть з\u2019явитися з затримкою — координати довантажуються на льоту.',

    'sort.priceAsc': 'Ціна (дешевше → дорожче)',
    'sort.priceDesc': 'Ціна (дорожче → дешевше)',
    'sort.ratingDesc': 'Рейтинг (вище → нижче)',
  },
} as const;

export type I18nKey = keyof (typeof dict)['en'];

@Injectable({ providedIn: 'root' })
export class I18n {
  private readonly platformId = inject(PLATFORM_ID);
  readonly lang = signal<Lang>(this.loadSaved());

  constructor() {
    effect(() => {
      const l = this.lang();
      if (isPlatformBrowser(this.platformId)) {
        try {
          localStorage.setItem(STORAGE_KEY, l);
        } catch {
          /* ignore */
        }
        document.documentElement.lang = l;
      }
    });
  }

  setLang(l: Lang): void {
    this.lang.set(l);
  }

  t(key: I18nKey): string {
    return dict[this.lang()][key] ?? dict.en[key] ?? key;
  }

  private loadSaved(): Lang {
    if (!isPlatformBrowser(this.platformId)) return 'en';
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'en' || saved === 'ua') return saved;
      if (saved === 'uk') return 'ua';
      const nav = (navigator.language ?? '').toLowerCase();
      if (nav.startsWith('uk') || nav.startsWith('ua')) return 'ua';
    } catch {
      /* ignore */
    }
    return 'en';
  }
}

export function useT() {
  const i18n = inject(I18n);
  return (key: I18nKey) => i18n.t(key);
}
