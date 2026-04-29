import { Component, OnInit } from '@angular/core';
import { Vehicle, VehicleService } from '../../services/vehicle.service';
import { NhtsaService } from '../../services/nhtsa.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-search',
  templateUrl: './search.component.html',
  styleUrls: ['./search.component.scss']
})
export class SearchComponent implements OnInit {
  // Search fields: year, make, model (dropdowns)
  year: string = 'All';
  make: string = 'All';
  model: string = 'All';
  vehicles: Vehicle[] = [];
  displayedVehicles: Vehicle[] = [];
  years: string[] = [];
  makes: string[] = [];
  makeModels: Record<string, string[]> = {};
  modelOptions: string[] = [];
  variants: any[] = [];
  selectedVariantId: string | number | null = null;
  vin: string = '';

  // Search method: 'vin' or 'details'
  searchMethod: 'vin' | 'details' = 'vin';

  constructor(private vs: VehicleService, private nhtsa: NhtsaService, private router: Router) {}

  ngOnInit(): void {
    // populate past 30 years (fallback)
    const now = new Date().getFullYear();
    for (let i = 0; i < 30; i++) { this.years.push(String(now - i)); }

    // Try to load available model years from NHTSA
    this.nhtsa.getAvailableModelYears().subscribe(res => {
      try {
        if (res && Array.isArray(res.Results) && res.Results.length) {
          const yrs = new Set<string>();
          for (const r of res.Results) { if (r && r.ModelYear) yrs.add(String(r.ModelYear)); }
          const arr = Array.from(yrs).sort((a,b) => Number(b) - Number(a));
          if (arr.length) this.years = arr;
        }
      } catch {}
    });

    // common makes
    this.makes = [
      'Toyota','Ford','Chevrolet','Honda','Nissan','BMW','Mercedes-Benz','Hyundai','Kia','Subaru',
      'Volkswagen','Audi','Lexus','Mazda','Tesla','Dodge','Jeep','GMC','Volvo','Mitsubishi','Chrysler','Cadillac'
    ];

    // common models per make (sample list)
    this.makeModels = {
      'Toyota': ['Camry','Corolla','RAV4','Prius','Highlander'],
      'Ford': ['F-150','Explorer','Focus','Escape','Mustang'],
      'Chevrolet': ['Silverado','Equinox','Malibu','Impala','Camaro'],
      'Honda': ['Civic','Accord','CR-V','Pilot','Fit'],
      'Nissan': ['Altima','Sentra','Rogue','Leaf','Pathfinder'],
      'BMW': ['3 Series','5 Series','X3','X5','i3'],
      'Mercedes-Benz': ['C-Class','E-Class','GLC','GLE','S-Class'],
      'Hyundai': ['Elantra','Sonata','Tucson','Santa Fe','Kona','Ioniq'],
      'Kia': ['Optima','Soul','Sportage','Sorento','Forte'],
      'Subaru': ['Impreza','Outback','Forester','Legacy','Crosstrek'],
      'Volkswagen': ['Golf','Passat','Jetta','Tiguan','Atlas'],
      'Audi': ['A3','A4','A6','Q5','Q7'],
      'Lexus': ['RX','ES','IS','NX','LS'],
      'Mazda': ['Mazda3','Mazda6','CX-5','CX-9','MX-5'],
      'Tesla': ['Model S','Model 3','Model X','Model Y'],
      'Dodge': ['Charger','Challenger','Durango','Journey'],
      'Jeep': ['Wrangler','Grand Cherokee','Cherokee','Renegade'],
      'GMC': ['Sierra','Terrain','Acadia','Yukon'],
      'Volvo': ['S60','S90','XC40','XC60','XC90'],
      'Mitsubishi': ['Outlander','Lancer','Eclipse Cross'],
      'Chrysler': ['300','Pacifica'],
      'Cadillac': ['Escalade','CTS','XT5']
    };

    // initial model options
    this.modelOptions = ['All'];

    this.vs.getAll().subscribe(list => {
      this.vehicles = list;
      // Merge models from dataset into makeModels so dropdown includes any sample vehicles
      for (const v of list) {
        try {
          const mk = v.make;
          const md = v.model;
          if (!mk || !md) continue;
          if (!this.makeModels[mk]) this.makeModels[mk] = [];
          if (this.makeModels[mk].indexOf(md) === -1) this.makeModels[mk].push(md);
        } catch (e) {
          // ignore malformed entries
        }
      }
      // if a make is already selected, refresh modelOptions
      if (this.make && this.make !== 'All') {
        const listForMake = this.makeModels[this.make] || [];
        this.modelOptions = ['All', ...listForMake];
      }
      this.applyFilters();
    });
    // vPIC integration removed: no variable or VIN preloads
    // If initial year selected, load dependent lists
    if (this.year && this.year !== 'All') this.loadMakesForYear(this.year);
  }

  // vPIC removed — navigate directly to results with prepared state

  onSearch() {
    this.applyFilters();
    // If VIN is provided, prefer VIN decode search and open results page
    if (this.vin && String(this.vin).trim()) {
      const vinVal = String(this.vin).trim();
      this.nhtsa.decodeVinValues(vinVal).subscribe(res => {
        try {
          const decoded = res && res.Results && res.Results[0] ? res.Results[0] : res;
          this.router.navigate(['/results'], { state: { decodedVinResult: decoded, year: this.year, make: this.make, model: this.model } });
        } catch (e) {
          this.router.navigate(['/results'], { state: { decodedVinResult: { error: true, message: String(e) }, year: this.year, make: this.make, model: this.model } });
        }
      }, err => {
        this.router.navigate(['/results'], { state: { decodedVinResult: { error: true, message: err?.message || String(err) }, year: this.year, make: this.make, model: this.model } });
      });
      return;
    }
    // query NHTSA for official safety ratings for the selected fields
    this.nhtsaResult = null;
    // If variant selected, fetch by VehicleId
    if (this.selectedVariantId) {
      this.nhtsa.getSafetyByVehicleId(this.selectedVariantId).subscribe(r => {
        this.nhtsaResult = r;
        try {
          const src = r && r.Results && r.Results.length ? r.Results[0] : r;
          if (src && typeof src === 'object') {
            this.nhtsaMapped = Object.keys(src).map(k => ({ k, v: (src as any)[k] }));
            this.preparePages();
            this.currentPage = 1;
            this.router.navigate(['/results'], { state: { nhtsaResult: r, nhtsaMapped: this.nhtsaMapped, year: this.year, make: this.make, model: this.model } });
          } else {
            this.nhtsaMapped = [];
            this.preparePages();
            this.router.navigate(['/results'], { state: { nhtsaResult: r, nhtsaMapped: this.nhtsaMapped, year: this.year, make: this.make, model: this.model } });
          }
        } catch (e) { this.nhtsaMapped = []; }
      }, err => {
        this.nhtsaResult = { error: true, message: err?.message || 'Request failed' };
        this.nhtsaMapped = [];
        this.preparePages();
        this.router.navigate(['/results'], { state: { nhtsaResult: this.nhtsaResult, nhtsaMapped: this.nhtsaMapped, year: this.year, make: this.make, model: this.model } });
      });
      return;
    }

    if (this.year && this.make && this.model && this.year !== 'All' && this.make !== 'All' && this.model !== 'All') {
      this.nhtsa.searchSafetyRatings(this.year, this.make, this.model).subscribe(r => {
        this.nhtsaResult = r;
        try {
          const src = r && r.Results && r.Results.length ? r.Results[0] : r;
          if (src && typeof src === 'object') {
            this.nhtsaMapped = Object.keys(src).map(k => ({ k, v: (src as any)[k] }));
            this.preparePages();
            this.currentPage = 1;
            // navigate to results page with state
            this.router.navigate(['/results'], { state: { nhtsaResult: r, nhtsaMapped: this.nhtsaMapped, year: this.year, make: this.make, model: this.model } });
          } else {
            this.nhtsaMapped = [];
            this.preparePages();
            this.router.navigate(['/results'], { state: { nhtsaResult: r, nhtsaMapped: this.nhtsaMapped, year: this.year, make: this.make, model: this.model } });
          }
        } catch (e) { this.nhtsaMapped = []; }
      }, err => {
        this.nhtsaResult = { error: true, message: err?.message || 'Request failed' };
        this.nhtsaMapped = [];
        this.preparePages();
        this.router.navigate(['/results'], { state: { nhtsaResult: this.nhtsaResult, nhtsaMapped: this.nhtsaMapped, year: this.year, make: this.make, model: this.model } });
      });
    }
    else {
      // No NHTSA query; navigate to results page with local displayedVehicles so user sees matches
      this.router.navigate(['/results'], { state: { nhtsaResult: null, nhtsaMapped: [], year: this.year, make: this.make, model: this.model, displayedVehicles: this.displayedVehicles } });
    }
  }

  nhtsaResult: any = null;
  nhtsaMapped: Array<{ k: string; v: any }> = [];

  // paging for results: 1=overview,2=media,3=remaining
  currentPage: number = 1;
  overviewItems: Array<{k:string;v:any}> = [];
  mediaItems: Array<{k:string;v:any}> = [];
  remainingItems: Array<{k:string;v:any}> = [];

  // Helpers for template: detect image/video URLs
  isImage(val: any): boolean {
    if (!val || typeof val !== 'string') return false;
    return /\.(jpe?g|png|gif|bmp|webp)(\?|$)/i.test(val) || /imgur\.com|photos\.google|\.aws\.amazonaws\.com/i.test(val);
  }

  isVideo(val: any): boolean {
    if (!val || typeof val !== 'string') return false;
    return /\.(mp4|webm|ogg)(\?|$)/i.test(val) || /youtube\.com|youtu\.be|vimeo\.com/i.test(val);
  }

  isUrl(val: any): boolean {
    if (!val || typeof val !== 'string') return false;
    return /^https?:\/\//i.test(val);
  }

  isArray(val: any): boolean {
    return Array.isArray ? Array.isArray(val) : false;
  }

  // Safely coerce a value to an array for *ngFor usage
  getArray(val: any): any[] {
    if (!val && val !== 0) return [];
    if (Array.isArray(val)) return val;
    // If it's an object with numeric keys or string, wrap it
    return [val];
  }

  getRemainingItems(): Array<{k:string;v:any}> {
    if (this.remainingItems && this.remainingItems.length) return this.remainingItems;
    if (this.nhtsaMapped && this.nhtsaMapped.length) return this.nhtsaMapped;
    return [];
  }

  humanizeKey(key: string): string {
    if (!key) return key;
    return key.replace(/([a-z])([A-Z])/g, '$1 $2');
  }

  preparePages() {
    this.overviewItems = [];
    this.mediaItems = [];
    this.remainingItems = [];
    if (!this.nhtsaMapped || !this.nhtsaMapped.length) return;
    const mediaCandidates: Array<{k:string;v:any}> = [];
    const rest: Array<{k:string;v:any}> = [];

    // explicit overview keys in desired order
    const desiredOverviewKeys = [
      'OverallRating',
      'OverallFrontCrashRating',
      'OverallSideCrashRating',
      'sideBarrierRating-Overall',
      'ModelYear',
      'Make',
      'Model',
      'VehicleDescription',
      'VehicleId'
    ];

    const keyMap = new Map<string, {k:string;v:any}>();
    for (const kv of this.nhtsaMapped) {
      keyMap.set(String(kv.k), kv);

      // detect media
      const v = kv.v;
      if (this.isArray(v)) {
        const arr = v as any[];
        if (arr.some(a => this.isImage(a) || this.isVideo(a) || this.isUrl(a))) {
          mediaCandidates.push(kv);
          continue;
        }
      }
      if (typeof v === 'string' && (this.isImage(v) || this.isVideo(v) || this.isUrl(v))) {
        mediaCandidates.push(kv);
        continue;
      }
    }

    // Build overview by exact key matching in specified order (case-sensitive keys from API)
    const overviewList: Array<{k:string;v:any}> = [];
    for (const key of desiredOverviewKeys) {
      if (keyMap.has(key)) {
        overviewList.push(keyMap.get(key)!);
        keyMap.delete(key);
      }
    }

    // Remaining keys (excluding mediaCandidates)
    for (const kv of this.nhtsaMapped) {
      if (overviewList.indexOf(kv) >= 0) continue;
      if (mediaCandidates.indexOf(kv) >= 0) continue;
      rest.push(kv);
    }

    this.overviewItems = overviewList;
    this.mediaItems = mediaCandidates;
    this.remainingItems = rest;
  }

  gotoPage(n:number) { this.currentPage = n; }
  nextPage() { if (this.currentPage < 3) this.currentPage++; }
  prevPage() { if (this.currentPage > 1) this.currentPage--; }

  applyFilters() {
    const y = (this.year || '').trim().toLowerCase();
    const mk = (this.make || '').trim().toLowerCase();
    const md = (this.model || '').trim().toLowerCase();
    this.displayedVehicles = this.vehicles.filter(v => {
      const vy = v.year ? String(v.year).toLowerCase() : '';
      const vmk = v.make ? String(v.make).toLowerCase() : '';
      const vmd = v.model ? String(v.model).toLowerCase() : '';
      const matchYear = !y || y === 'all' || vy.includes(y);
      const matchMake = !mk || mk === 'all' || vmk.includes(mk);
      const matchModel = !md || md === 'all' || vmd.includes(md);
      return matchYear && matchMake && matchModel;
    });
  }

  // New NHTSA-driven loaders and handlers
  loadMakesForYear(year: string) {
    this.makes = [];
    this.nhtsa.getMakesForYear(year).subscribe(res => {
      try {
        if (res && Array.isArray(res.Results)) {
          const set = new Set<string>();
          for (const r of res.Results) { if (r && r.Make) set.add(r.Make); }
          this.makes = Array.from(set).sort();
        }
      } catch {}
      if (!this.makes.length) this.makes = Object.keys(this.makeModels).sort();
    });
  }

  loadModelsForYearMake(year: string, make: string) {
    this.modelOptions = ['All'];
    this.nhtsa.getModelsForMakeYearSafety(year, make).subscribe(res => {
      try {
        if (res && Array.isArray(res.Results)) {
          const set = new Set<string>();
          for (const r of res.Results) { if (r && r.Model) set.add(r.Model); }
          this.modelOptions = ['All', ...Array.from(set).sort()];
        }
      } catch {}
      if (this.modelOptions.length === 1) {
        // fallback to local models (case-insensitive key match)
        const key = Object.keys(this.makeModels).find(k => k.toLowerCase() === String(make).toLowerCase());
        const local = key ? this.makeModels[key] : (this.makeModels[make] || []);
        this.modelOptions = ['All', ...local];
      }
      // reset model selection whenever modelOptions are refreshed
      this.model = 'All';
      this.variants = [];
      this.selectedVariantId = null;

      // If only one concrete model is available, auto-select it and preload variants
      const concreteModels = this.modelOptions.filter(m => m && m.toLowerCase() !== 'all');
      if (concreteModels.length === 1) {
        this.model = concreteModels[0];
        // load variants for the newly selected model
        if (this.year && this.year !== 'All' && this.make && this.make !== 'All') {
          this.loadVariantsForYMM(this.year, this.make, this.model);
        }
      } else if (this.model && this.model !== 'All' && this.modelOptions.find(m => m === this.model)) {
        // if a model was previously selected and is present in refreshed options, preload variants
        if (this.year && this.year !== 'All' && this.make && this.make !== 'All') {
          this.loadVariantsForYMM(this.year, this.make, this.model);
        }
      }
    });
  }

  loadVariantsForYMM(year: string, make: string, model: string) {
    this.variants = [];
    this.selectedVariantId = null;
    this.nhtsa.getVariants(year, make, model).subscribe(res => {
      try {
        if (res && Array.isArray(res.Results)) {
          this.variants = res.Results.map((r:any) => ({ vehicleId: r.VehicleId, description: r.VehicleDescription || r.Vehicle }));
        }
      } catch {}
    });
  }

  onYearChange(ev: any) {
    // ev from ngModel change; value available on this.year
    if (this.year && this.year !== 'All') this.loadMakesForYear(this.year);
    this.model = 'All';
    this.variants = [];
    this.selectedVariantId = null;
  }

  onModelChange(ev: any) {
    if (this.year && this.make && this.model && this.year !== 'All' && this.make !== 'All' && this.model !== 'All') {
      this.loadVariantsForYMM(this.year, this.make, this.model);
    }
    this.selectedVariantId = null;
  }

  onMakeChange() {
    if (!this.make || this.make === 'All') {
      this.modelOptions = ['All'];
      this.model = 'All';
      this.variants = [];
      this.selectedVariantId = null;
      return;
    }

    // If a year is selected, prefer API-driven models for accuracy
    if (this.year && this.year !== 'All') {
      this.loadModelsForYearMake(this.year, this.make);
      return;
    }

    // Fallback: case-insensitive lookup into local makeModels
    const key = Object.keys(this.makeModels).find(k => k.toLowerCase() === String(this.make).toLowerCase());
    const list = key ? this.makeModels[key] : (this.makeModels[this.make] || []);
    this.modelOptions = ['All', ...list];
    this.model = 'All';
    this.variants = [];
    this.selectedVariantId = null;
  }

  setSearchMethod(method: 'vin' | 'details') {
    this.searchMethod = method;
    // Reset fields when switching methods
    if (method === 'vin') {
      this.year = 'All';
      this.make = 'All';
      this.model = 'All';
      this.selectedVariantId = null;
    } else {
      this.vin = '';
    }
  }

  isSearchValid(): boolean {
    if (this.searchMethod === 'vin') {
      return this.vin.trim().length === 17;
    } else {
      return this.year !== 'All' && this.make !== 'All' && this.model !== 'All';
    }
  }
}
