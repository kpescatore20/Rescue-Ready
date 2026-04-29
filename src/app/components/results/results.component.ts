import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { VehicleService } from '../../services/vehicle.service';
import { NhtsaService } from '../../services/nhtsa.service';

@Component({
  selector: 'app-results',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './results.component.html',
  styleUrls: ['./results.component.scss']
})
export class ResultsComponent implements OnInit {
  nhtsaResult: any = null;
  nhtsaMapped: Array<{k:string;v:any}> = [];
  displayedVehicles: any[] = [];
  year = '';
  make = '';
  model = '';

  // pages
  currentPage = 1;
  overviewItems: Array<{k:string;v:any}> = [];
  mediaItems: Array<{k:string;v:any}> = [];
  remainingItems: Array<{k:string;v:any}> = [];

  // lists for dropdowns
  years: string[] = [];
  makes: string[] = [];
  makeModels: Record<string, string[]> = {};
  modelOptions: string[] = [];
  vehicles: any[] = [];
  variants: any[] = [];
  selectedVariantId: string | number | null = null;
  vin: string = '';

  // VIN decode state (vPIC)
  decodedVinResult: any = null;
  // parsed summary from VIN decode (airbag locations/presence)
  airbagSummary: string[] = [];
  // additional overview items derived from VIN decode or other summaries
  overviewExtras: Array<{k:string;v:any}> = [];

  constructor(private router: Router, private vs: VehicleService, private nhtsa: NhtsaService) { }

  ngOnInit(): void {
    // Prefer router navigation state, but fall back to history.state (page reloads / direct visits)
    const nav = this.router.getCurrentNavigation();
    const state: any = (nav && nav.extras && nav.extras.state)
      ? nav.extras.state
      : (typeof history !== 'undefined' && (history as any).state ? (history as any).state : {});
    console.log('ResultsComponent state:', state);
    this.nhtsaResult = state.nhtsaResult || null;
    this.nhtsaMapped = state.nhtsaMapped || [];
    this.displayedVehicles = state.displayedVehicles || [];
    this.year = state.year || '';
    this.make = state.make || '';
    this.model = state.model || '';
    // accept decoded VIN result passed via navigation state
    this.decodedVinResult = state.decodedVinResult || null;
    if (this.decodedVinResult) {
      try { this.parseDecodedVin(); } catch (e) { /* ignore */ }
    }
    this.preparePages();
    // load model years from NHTSA (Step 1)
    this.nhtsa.getAvailableModelYears().subscribe(res => {
      try {
        if (res && Array.isArray(res.Results) && res.Results.length) {
          const yrs = new Set<string>();
          for (const r of res.Results) {
            if (r && r.ModelYear) yrs.add(String(r.ModelYear));
          }
          this.years = Array.from(yrs).sort((a,b) => Number(b) - Number(a));
        }
      } catch (e) { }
      if (!this.years || !this.years.length) {
        const now = new Date().getFullYear();
        for (let i = 0; i < 30; i++) { this.years.push(String(now - i)); }
      }
    });

    this.modelOptions = ['All'];

    // load local dataset and merge models (fall-back enrichment)
    this.vs.getAll().subscribe(list => {
      this.vehicles = list;
      for (const v of list) {
        try {
          const mk = v.make;
          const md = v.model;
          if (!mk || !md) continue;
          if (!this.makeModels[mk]) this.makeModels[mk] = [];
          if (this.makeModels[mk].indexOf(md) === -1) this.makeModels[mk].push(md);
        } catch (e) {}
      }
      if (this.make && this.make !== 'All') {
        const listForMake = this.makeModels[this.make] || [];
        this.modelOptions = ['All', ...listForMake];
      }
      // If no NHTSA result and displayedVehicles empty, compute filtered local results
      if ((!this.nhtsaResult || this.nhtsaMapped.length === 0) && (!this.displayedVehicles || this.displayedVehicles.length === 0)) {
        this.applyFilters();
      }
      // vPIC removed: no airbag variable list
    });
    // vPIC removed: VIN decode not performed
  }

  // vPIC removed: functions to load variable values and VIN parsing removed

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

  loadMakesForYear(year: string) {
    this.makes = [];
    this.nhtsa.getMakesForYear(year).subscribe(res => {
      try {
        if (res && Array.isArray(res.Results)) {
          const set = new Set<string>();
          for (const r of res.Results) {
            if (r && r.Make) set.add(r.Make);
          }
          this.makes = Array.from(set).sort();
        }
      } catch (e) {
        // ignore
      }
      if (!this.makes.length) {
        this.makes = Object.keys(this.makeModels).sort();
      }
    });
  }

  loadModelsForYearMake(year: string, make: string) {
    this.modelOptions = ['All'];
    this.nhtsa.getModelsForMakeYearSafety(year, make).subscribe(res => {
      try {
        if (res && Array.isArray(res.Results)) {
          const set = new Set<string>();
          for (const r of res.Results) {
            if (r && r.Model) set.add(r.Model);
          }
          this.modelOptions = ['All', ...Array.from(set).sort()];
        }
      } catch (e) {
        // ignore
      }
      if (this.modelOptions.length === 1) {
          const key = Object.keys(this.makeModels).find(k => k.toLowerCase() === String(make).toLowerCase());
          const local = key ? this.makeModels[key] : (this.makeModels[make] || []);
          this.modelOptions = ['All', ...local];
      }
        // If a single concrete model exists, auto-select and preload variants
        const concreteModels = this.modelOptions.filter(m => m && m.toLowerCase() !== 'all');
        if (concreteModels.length === 1) {
          this.model = concreteModels[0];
          if (this.year && this.year !== 'All' && this.make && this.make !== 'All') {
            this.loadVariantsForYMM(this.year, this.make, this.model);
          }
        } else if (this.model && this.model !== 'All' && this.modelOptions.find(m => m === this.model)) {
          if (this.year && this.year !== 'All' && this.make && this.make !== 'All') {
            this.loadVariantsForYMM(this.year, this.make, this.model);
          }
        }
    });
  }

  onYearChange(ev: any) {
    this.year = ev && ev.target ? ev.target.value : ev;
    this.model = '';
    this.selectedVariantId = null;
    this.variants = [];
    if (this.year && this.year !== 'All') this.loadMakesForYear(this.year);
  }

  onModelChange(ev: any) {
    this.model = ev && ev.target ? ev.target.value : ev;
    this.selectedVariantId = null;
    this.variants = [];
    if (this.year && this.make && this.model && this.year !== 'All' && this.make !== 'All' && this.model !== 'All') {
      this.loadVariantsForYMM(this.year, this.make, this.model);
    }
  }

  onSearch() {
    // apply local filters first
    this.applyFilters();
    if (this.year && this.make && this.model && this.year !== 'All' && this.make !== 'All' && this.model !== 'All') {
      this.nhtsa.searchSafetyRatings(this.year, this.make, this.model).subscribe(r => {
        this.nhtsaResult = r;
        try {
          const src = r && r.Results && r.Results.length ? r.Results[0] : r;
          if (src && typeof src === 'object') {
            this.nhtsaMapped = Object.keys(src).map(k => ({ k, v: (src as any)[k] }));
          } else {
            this.nhtsaMapped = [];
          }
        } catch (e) { this.nhtsaMapped = []; }
        this.currentPage = 1;
        this.preparePages();
      }, err => {
        this.nhtsaResult = { error: true, message: err?.message || 'Request failed' };
        this.nhtsaMapped = [];
        this.preparePages();
      });
    } else {
      // Clear NHTSA-specific view when not querying
      this.nhtsaResult = null;
      this.nhtsaMapped = [];
      this.preparePages();
    }
  }

  onMakeChange() {
    if (!this.make || this.make === 'All') { this.modelOptions = ['All']; this.model = 'All'; this.variants = []; this.selectedVariantId = null; return; }
    // prefer API-driven models for selected year+make
    if (this.year && this.year !== 'All') {
      this.loadModelsForYearMake(this.year, this.make);
    } else {
      const list = this.makeModels[this.make] || [];
      this.modelOptions = ['All', ...list];
    }
    this.model = 'All';
    this.variants = [];
    this.selectedVariantId = null;
  }

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

  preparePages() {
    this.overviewItems = [];
    this.mediaItems = [];
    this.remainingItems = [];
    if (!this.nhtsaMapped || !this.nhtsaMapped.length) return;

    const desiredOverviewKeys = [
      'OverallRating','OverallFrontCrashRating','OverallSideCrashRating','sideBarrierRating-Overall',
      'ModelYear','Make','Model','VehicleDescription','VehicleId'
    ];

    const keyMap = new Map<string, {k:string;v:any}>();
    const mediaCandidates: Array<{k:string;v:any}> = [];

    for (const kv of this.nhtsaMapped) {
      keyMap.set(String(kv.k), kv);
      const v = kv.v;
      if (Array.isArray(v)) {
        if (v.some((a:any) => typeof a === 'string' && (a.match(/\.(jpe?g|png|gif|bmp|webp)(\?|$)/i) || /youtube\.com|youtu\.be|vimeo\.com/i.test(a)))) {
          mediaCandidates.push(kv);
        }
      } else if (typeof v === 'string' && (v.match(/\.(jpe?g|png|gif|bmp|webp)(\?|$)/i) || /youtube\.com|youtu\.be|vimeo\.com/i.test(v))) {
        mediaCandidates.push(kv);
      }
    }

    const overviewList: Array<{k:string;v:any}> = [];
    for (const key of desiredOverviewKeys) {
      if (!this.decodedVinResult && key === 'VehicleId') continue; // hide VehicleId unless VIN decode
      if (keyMap.has(key)) { overviewList.push(keyMap.get(key)!); keyMap.delete(key); }
    }

    const rest: Array<{k:string;v:any}> = [];
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
  backToSearch() { this.router.navigate(['/search']); }

  // Helpers for template
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

  isArray(val: any): boolean { return Array.isArray ? Array.isArray(val) : false; }

  // Safely coerce a value to an array for *ngFor usage
  getArray(val: any): any[] {
    if (!val && val !== 0) return [];
    if (Array.isArray(val)) return val;
    return [val];
  }

  humanizeKey(key: string): string {
    if (!key) return key;
    return key.replace(/([a-z])([A-Z])/g, '$1 $2');
  }

  get vehicleId(): string | null {
    if (!this.nhtsaMapped) return null;
    const item = this.nhtsaMapped.find(kv => kv.k === 'VehicleId');
    return item ? String(item.v) : null;
  }

  get vehicleModel(): string | null {
    if (!this.nhtsaMapped) return null;
    const item = this.nhtsaMapped.find(kv => kv.k === 'Model');
    return item ? String(item.v) : null;
  }

  getManufacturerUrl(make: string, model?: string): string {
    const makeLower = make.toLowerCase();
    const modelLower = model ? model.toLowerCase().replace(/\s+/g, '-') : '';
    const urls: { [key: string]: string } = {
      'toyota': 'https://www.toyota.com',
      'ford': 'https://www.ford.com',
      'chevrolet': 'https://www.chevrolet.com',
      'honda': 'https://www.honda.com',
      'nissan': 'https://www.nissanusa.com',
      'bmw': 'https://www.bmwusa.com',
      'mercedes-benz': 'https://www.mbusa.com',
      'hyundai': 'https://www.hyundaiusa.com',
      'kia': 'https://www.kia.com',
      'subaru': 'https://www.subaru.com',
      'volkswagen': 'https://www.vw.com',
      'audi': 'https://www.audiusa.com',
      'lexus': 'https://www.lexus.com',
      'mazda': 'https://www.mazdausa.com',
      'tesla': 'https://www.tesla.com',
      'dodge': 'https://www.dodge.com',
      'jeep': 'https://www.jeep.com',
      'gmc': 'https://www.gmc.com',
      'volvo': 'https://www.volvocars.com',
      'mitsubishi': 'https://www.mitsubishicars.com',
      'chrysler': 'https://www.chrysler.com',
      'cadillac': 'https://www.cadillac.com'
    };
    // Specific model URLs
    const modelUrls: { [key: string]: string } = {
      'ford-f-150': 'https://www.ford.com/trucks/f150/',
      'ford-explorer': 'https://www.ford.com/suvs/explorer/',
      'ford-focus': 'https://www.ford.com/cars/focus/',
      'ford-escape': 'https://www.ford.com/suvs/escape/',
      'ford-mustang': 'https://www.ford.com/cars/mustang/',
      'toyota-camry': 'https://www.toyota.com/camry/',
      'toyota-corolla': 'https://www.toyota.com/corolla/',
      'toyota-rav4': 'https://www.toyota.com/rav4/',
      'toyota-prius': 'https://www.toyota.com/prius/',
      'toyota-highlander': 'https://www.toyota.com/highlander/',
      // Add more as needed
    };
    const key = `${makeLower}-${modelLower}`;
    if (modelUrls[key]) {
      return modelUrls[key];
    }
    return urls[makeLower] || '';
  }

  // Parse decoded VIN result to extract airbag-related information into a summary
  parseDecodedVin() {
    this.airbagSummary = [];
    if (!this.decodedVinResult || typeof this.decodedVinResult !== 'object') return;
    const textValues: string[] = [];
    for (const k of Object.keys(this.decodedVinResult)) {
      try {
        const v = this.decodedVinResult[k];
        const key = String(k || '').toLowerCase();
        const sval = (v === null || v === undefined) ? '' : String(v).toLowerCase();
        if (/air ?bag|srs|supplemental restraint|seat belt tensioner|airbagloc|airbag_loc|curtain/i.test(key) || /air ?bag|srs|curtain|side air|front air|knee air/i.test(sval)) {
          textValues.push(`${k}: ${v}`);
        }
      } catch (e) { /* ignore per-field errors */ }
    }
    this.airbagSummary = Array.from(new Set(textValues));
    // Build overviewExtras for display on Overview page
    this.overviewExtras = this.airbagSummary.map(s => {
      const parts = String(s).split(':');
      const k = (parts.shift() || '').trim();
      const v = parts.join(':').trim();
      const display = (v === null || v === undefined || String(v).trim() === '') ? 'N/A' : v;
      return { k: k || 'Airbag', v: display };
    });
  }

  // Return a display string for template: 'N/A' for empty/null/empty-array/empty-object, JSON for objects, otherwise string
  displayValue(val: any): string {
    if (val === null || val === undefined) return 'N/A';
    if (typeof val === 'string' && val.trim() === '') return 'N/A';
    if (Array.isArray(val) && val.length === 0) return 'N/A';
    if (typeof val === 'object') {
      try { return JSON.stringify(val); } catch { return String(val); }
    }
    return String(val);
  }

  // Remaining tab fallback: if partitioning leaves no remaining rows,
  // show all mapped NHTSA rows so the table is never blank when data exists.
  getRemainingItems(): Array<{k:string;v:any}> {
    if (this.remainingItems && this.remainingItems.length) return this.remainingItems;
    if (this.nhtsaMapped && this.nhtsaMapped.length) return this.nhtsaMapped;
    if (this.decodedVinResult && typeof this.decodedVinResult === 'object') {
      const src = (Array.isArray(this.decodedVinResult.Results) && this.decodedVinResult.Results.length)
        ? this.decodedVinResult.Results[0]
        : this.decodedVinResult;
      if (src && typeof src === 'object') {
        return Object.keys(src).map(k => ({ k, v: (src as any)[k] }));
      }
    }
    return [];
  }

  // return overview items merged with extras (VIN summaries)
  getOverviewItems(): Array<{k:string;v:any}> {
    if (!this.overviewItems) this.overviewItems = [];
    if (!this.overviewExtras) this.overviewExtras = [];
    const base: Array<{k:string;v:any}> = [];
    const hasKey = (key: string) => this.overviewItems.some(i => String(i.k) === key) || this.overviewExtras.some(i => String(i.k) === key);
    const meaningful = (v: any) => v !== null && v !== undefined && String(v).trim() !== '' && String(v).toLowerCase() !== 'all';

    // Helper to search nhtsaMapped and raw nhtsaResult for possible keys/patterns
    const findNhtsaValue = (patterns: string[]): any => {
      const allCandidates = (this.nhtsaMapped || []).concat(this.remainingItems || []);
      for (const kv of allCandidates) {
        try {
          const key = String(kv.k || '').toLowerCase();
          for (const p of patterns) {
            if (key === p || key.includes(p)) {
              const v = kv.v;
              if (meaningful(v)) return Array.isArray(v) ? (v[0] ?? null) : v;
            }
          }
        } catch (e) { }
      }
      // fallback: examine the raw nhtsaResult top-level object or first Results entry
      try {
        const src = (this.nhtsaResult && Array.isArray(this.nhtsaResult.Results) && this.nhtsaResult.Results.length)
          ? this.nhtsaResult.Results[0]
          : this.nhtsaResult;
        if (src && typeof src === 'object') {
          for (const k of Object.keys(src)) {
            const lk = String(k).toLowerCase();
            for (const p of patterns) {
              if (lk === p || lk.includes(p)) {
                const v = (src as any)[k];
                if (meaningful(v)) return Array.isArray(v) ? (v[0] ?? null) : v;
              }
            }
          }
        }
      } catch (e) { }

      // also check decoded VIN result (vPIC) — often contains Make/Model/ModelYear/Trim in Results[0]
      try {
        const dv = (this.decodedVinResult && Array.isArray(this.decodedVinResult.Results) && this.decodedVinResult.Results.length)
          ? this.decodedVinResult.Results[0]
          : this.decodedVinResult;
        if (dv && typeof dv === 'object') {
          for (const k of Object.keys(dv)) {
            const lk = String(k).toLowerCase();
            for (const p of patterns) {
              if (lk === p || lk.includes(p)) {
                const v = (dv as any)[k];
                if (meaningful(v)) return Array.isArray(v) ? (v[0] ?? null) : v;
              }
            }
          }
        }
      } catch (e) { }
      return null;
    };

    // Only include ModelYear / Make / Model when the search was a VIN decode
    if (this.decodedVinResult) {
      if (!hasKey('ModelYear')) {
        const val = meaningful(this.year) ? this.year : findNhtsaValue(['modelyear', 'model year', 'year']);
        if (meaningful(val)) base.push({ k: 'ModelYear', v: val });
      }
      if (!hasKey('Make')) {
        const val = meaningful(this.make) ? this.make : findNhtsaValue(['make', 'manufacturer', 'vehiclemake', 'manufacturername']);
        if (meaningful(val)) base.push({ k: 'Make', v: val });
      }
      if (!hasKey('Model')) {
        const val = meaningful(this.model) ? this.model : findNhtsaValue(['model', 'modelname', 'vehicle model', 'vehicle']);
        if (meaningful(val)) base.push({ k: 'Model', v: val });
      }
    }

    // Trim: prefer selected variant description, fall back to VehicleDescription in overviewItems
    let trimVal: any = null;
    if (this.selectedVariantId) {
      try {
        const found = (this.variants || []).find(v => String(v.vehicleId) === String(this.selectedVariantId));
        if (found) trimVal = found.description || found.vehicleDescription || null;
      } catch (e) { /* ignore */ }
    }
    // if still missing, check existing overviewItems for VehicleDescription
    if (!trimVal) {
      const vd = this.overviewItems.find(i => String(i.k) === 'VehicleDescription');
      if (vd && vd.v) trimVal = vd.v;
    }
    // Only include Trim in Overview when the search was a VIN decode
    if (!hasKey('Trim') && this.decodedVinResult) {
      let val = meaningful(trimVal) ? trimVal : findNhtsaValue(['trim', 'vehicledescription', 'vehicle description', 'modeltrim', 'trimlevel']);
      if (meaningful(val)) base.push({ k: 'Trim', v: val });
    }

    return [...base, ...this.overviewItems, ...this.overviewExtras];
  }
  
}
