import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { VehicleService } from '../../services/vehicle.service';
import { NhtsaService } from '../../services/nhtsa.service';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

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
  rescueItems: Array<{k:string;v:any}> = [];

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
  // rescue-specific data from VIN decode
  rescueInfo: Array<{k:string;v:any}> = [];
  hazardWarnings: string[] = [];

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
  backToSearch() { this.router.navigate(['']); }

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

  getVehicleModel(): string | null {
    if (!this.nhtsaMapped) return null;
    const item = this.nhtsaMapped.find(kv => kv.k === 'VehicleId');
    return item ? String(item.v) : null;
  }

  getFilteredRescueItems(): Array<{k:string;v:any}> {
    return this.rescueItems.filter(kv => this.displayValue(kv.v) !== 'N/A');
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
    this.rescueInfo = [];
    this.hazardWarnings = [];
    if (!this.decodedVinResult || typeof this.decodedVinResult !== 'object') return;
    const airbagValues: string[] = [];
    const rescueValues: Array<{k:string;v:any}> = [];
    for (const k of Object.keys(this.decodedVinResult)) {
      try {
        const v = this.decodedVinResult[k];
        const key = String(k || '').toLowerCase();
        const sval = (v === null || v === undefined) ? '' : String(v).toLowerCase();
        if (/air ?bag|srs|supplemental restraint|seat belt tensioner|airbagloc|airbag_loc|curtain/i.test(key) || /air ?bag|srs|curtain|side air|front air|knee air/i.test(sval)) {
          airbagValues.push(`${k}: ${v}`);
        } else if (/fuel|engine|battery|weight|dimension|voltage|hybrid|electric/i.test(key) || /gasoline|diesel|electric|hybrid/i.test(sval)) {
          rescueValues.push({ k: k, v: v });
          // Check for hazards
          if (/fuel.*type.*primary/i.test(key) && /electric/i.test(sval)) {
            this.hazardWarnings.push('HIGH VOLTAGE BATTERY: This vehicle has a high-voltage electric battery. Do not cut or damage battery components. Evacuate area if damaged.');
          }
          if (/fuel.*type.*primary/i.test(key) && /compressed.*natural.*gas|cng/i.test(sval)) {
            this.hazardWarnings.push('FLAMMABLE GAS: This vehicle uses Compressed Natural Gas (CNG). Avoid sparks and flames near fuel system.');
          }
          if (/fuel.*type.*primary/i.test(key) && /hybrid/i.test(sval)) {
            this.hazardWarnings.push('HYBRID SYSTEM: This vehicle has both electric and gasoline systems. High voltage present - exercise caution.');
          }
          if (/battery.*type/i.test(key) && /lithium|lithium-ion/i.test(sval)) {
            this.hazardWarnings.push('LITHIUM BATTERY: Lithium-ion battery present. Thermal runaway risk if damaged.');
          }
        }
      } catch (e) { /* ignore per-field errors */ }
    }
    this.airbagSummary = Array.from(new Set(airbagValues));
    this.rescueInfo = rescueValues;
    this.rescueItems = rescueValues; // for display
    // Build overviewExtras for display on Overview page
    this.overviewExtras = this.airbagSummary.map(s => {
      const parts = String(s).split(':');
      const k = (parts.shift() || '').trim();
      const v = parts.join(':').trim();
      const display = (v === null || v === undefined || String(v).trim() === '') ? 'N/A' : v;
      return { k: k || 'Airbag', v: display };
    });
    // Add rescue info to overview
    this.overviewExtras = this.overviewExtras.concat(this.rescueInfo);
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
    let items: Array<{k:string;v:any}> = [];
    if (this.remainingItems && this.remainingItems.length) items = this.remainingItems;
    else if (this.nhtsaMapped && this.nhtsaMapped.length) items = this.nhtsaMapped;
    else if (this.decodedVinResult && typeof this.decodedVinResult === 'object') {
      const src = (Array.isArray(this.decodedVinResult.Results) && this.decodedVinResult.Results.length)
        ? this.decodedVinResult.Results[0]
        : this.decodedVinResult;
      if (src && typeof src === 'object') {
        items = Object.keys(src).map(k => ({ k, v: (src as any)[k] }));
      }
    }
    return items.filter(kv => this.displayValue(kv.v) !== 'N/A');
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

    return [...base, ...this.overviewItems, ...this.overviewExtras].filter(kv => this.displayValue(kv.v) !== 'N/A');
  }

  async generatePrintableReport() {
    const element = document.getElementById('results-content');
    if (!element) return;

    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      allowTaint: true
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');

    const imgWidth = 210; // A4 width in mm
    const pageHeight = 295; // A4 height in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight;

    let position = 0;

    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft >= 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    pdf.save('rescue-ready-report.pdf');
  }

  getVehicleDisplayName(): string {
    const parts: string[] = [];
    if (this.year && this.year !== 'All') parts.push(this.year);
    if (this.make && this.make !== 'All') parts.push(this.make);
    if (this.model && this.model !== 'All') parts.push(this.model);
    return parts.length > 0 ? parts.join(' ') : 'Vehicle Information';
  }

  isElectricVehicle(): boolean {
    // Check if this is an electric or hybrid vehicle based on available data
    const fuelTypes = ['electric', 'hybrid', 'battery', 'ev'];
    const makeModel = `${this.make || ''} ${this.model || ''}`.toLowerCase();

    // Check decoded VIN data for fuel type
    if (this.decodedVinResult) {
      const vinData = Array.isArray(this.decodedVinResult.Results)
        ? this.decodedVinResult.Results[0]
        : this.decodedVinResult;

      for (const key in vinData) {
        const value = String(vinData[key]).toLowerCase();
        if (fuelTypes.some(type => value.includes(type))) {
          return true;
        }
      }
    }

    // Check make/model for known EV brands
    const evBrands = ['tesla', 'rivian', 'lucid', 'polestar', 'vinfast'];
    if (evBrands.some(brand => makeModel.includes(brand))) {
      return true;
    }

    return false;
  }

  hasFuelSystem(): boolean {
    // Check if vehicle has traditional fuel system (gasoline/diesel)
    const fuelTypes = ['gasoline', 'diesel', 'petrol', 'fuel', 'tank'];

    if (this.decodedVinResult) {
      const vinData = Array.isArray(this.decodedVinResult.Results)
        ? this.decodedVinResult.Results[0]
        : this.decodedVinResult;

      for (const key in vinData) {
        const value = String(vinData[key]).toLowerCase();
        if (fuelTypes.some(type => value.includes(type))) {
          return true;
        }
      }
    }

    // Assume most vehicles have fuel systems unless proven otherwise
    return !this.isElectricVehicle();
  }

  getVehicleModel(): string {
    return this.model || '';
  }

  getVehicleSpecificSteps(): Array<{
    number: number;
    title: string;
    details: string[];
  }> {
    const steps: Array<{
      number: number;
      title: string;
      details: string[];
    }> = [];

    const isEV = this.isElectricVehicle();
    const hasFuel = this.hasFuelSystem();
    const yearNum = parseInt(this.year || '0', 10);
    const vehicleAge = new Date().getFullYear() - yearNum;
    const vehicleInfo = `${this.year || 'Unknown'} ${this.make || ''} ${this.model || ''}`.trim();

    // STEP 1: Initial Assessment
    steps.push({
      number: 1,
      title: `Initial Assessment - ${vehicleInfo}`,
      details: [
        `Scene safety: Check for downed power lines (hazard if ${isEV ? 'EV with damage' : 'standard vehicle'})`,
        `Vehicle position: Assess rollover risk and ground stability`,
        `Check for visible damage: ${isEV ? 'Look for battery housing integrity and electrical hazards' : 'Check for fuel leakage, coolant, and mechanical damage'}`,
        isEV ? `⚠️ HIGH VOLTAGE HAZARD: This is an electric vehicle. Expect high-voltage systems that can remain energized even after power disconnection.` : 
              hasFuel ? `⚠️ FUEL FIRE HAZARD: Check for fuel leaks before using cutters or high-heat tools.` : 
              `Stabilize vehicle to prevent movement`,
        `Patient assessment: Confirm victim(s) location and condition before entry attempt`,
        `Deploy air bags: Ensure deployed airbags are not re-triggered during extrication`
      ]
    });

    // STEP 2: Gain Access
    steps.push({
      number: 2,
      title: `Gain Access - ${this.make || 'Vehicle'} ${this.model || ''}`,
      details: [
        `Attempt all doors first: Check for manual override or mechanical release`,
        `Power locks: ${isEV ? 'May not function if battery is compromised' : 'Try locking mechanism; check for child safety locks'}`,
        `Window entry: ${vehicleAge > 15 ? 'Manually crank windows if power windows fail' : 'Check for power window controls; may be disabled after accident'}`,
        isEV ? `Battery cutoff: If accessible and trained, disconnect HV battery to prevent re-energization` : 
              `Battery disconnect: Disconnect negative battery terminal to prevent electrical fires if cutting required`,
        `Airbag deployment risk: Keep personnel clear of steering wheel, dashboard, and side panels during entry`,
        hasFuel && vehicleAge < 10 ? `Fuel smell indicator: Do not use arc cutters if fuel odor detected; use hydraulic tools instead` : '',
        `Glass management: Use controlled glass removal techniques`
      ].filter(d => d) // Remove empty strings
    });

    // STEP 3: Disentanglement & Patient Access
    steps.push({
      number: 3,
      title: `Disentanglement - ${vehicleInfo}`,
      details: [
        `Dashboard/steering wheel removal: Needed for ${this.model || 'this vehicle'} to access trapped limbs`,
        isEV ? `Avoid cutting near battery housing: Battery typically in ${yearNum >= 2015 ? 'floor pan or under seats - do not cut through these areas' : 'unknown location - check vehicle diagrams'}` : 
              `Fuel tank location for ${this.year} ${this.make}: ${hasFuel && vehicleAge < 10 ? 'Likely in rear undercarriage - avoid puncturing' : 'Confirm before cutting'}`,
        `Seat belt cutting: Use trauma shears; be cautious of pretensioners which may deploy`,
        `Foot pedal displacement: May need removal for leg access - ${isEV ? 'no hydraulic brake fluid to worry about' : 'watch for brake line rupture'}`,
        hasFuel ? `Fuel system hazard: ${vehicleAge < 5 ? 'Modern vehicles have fuel shutoff switches; locate and disable' : 'Older vehicles may not have automatic shutoff - extreme caution'}` : '',
        `Extrication through largest opening: Door removal often faster than complex technical cuts`,
        hasFuel ? `Fire suppression ready: Have AFFF foam or CO2 apparatus staged for potential fuel ignition` : ``
      ].filter(d => d)
    });

    // STEP 4: Door/Roof Removal Strategy
    steps.push({
      number: 4,
      title: `Door & Roof Removal - ${this.make} ${this.model}`,
      details: [
        `Front door removal: ${vehicleAge < 10 ? 'Cut hinges and latch; hinge bolts typically 11-14mm' : 'Check hinge configuration; may vary from modern vehicles'}`,
        `B-pillar cutting zone: Safe cut point is lower third to middle - avoid upper B-pillar which supports roof`,
        `Side curtain airbags: Located along A and C pillars - maintain 18-24 inch clearance from roof rail`,
        hasFuel ? `Fuel line proximity: ${vehicleAge < 3 ? 'Fuel rails run along floor; watch for pressurized lines when cutting floor pan' : ''}` : '',
        isEV ? `High voltage main: Located under ${yearNum >= 2018 ? 'vehicle floor typically - DO NOT cut through' : 'seat area - confirm location before cutting'}` : '',
        `Roof cutting: ${vehicleAge > 20 ? 'Older vehicles may have less reinforced roof - be prepared for roof collapse' : 'Modern rooflines are reinforced; may require dual-sided cuts'}`,
        `Post-cut stabilization: Use airbags or jacks to support roof before personnel entry`
      ].filter(d => d)
    });

    // STEP 5: Patient Extrication
    steps.push({
      number: 5,
      title: `Patient Extrication from ${vehicleInfo}`,
      details: [
        `Spinal precautions: Use long backboard and KED; assume spinal injury until proven otherwise`,
        `Exit route: Largest door opening preferred; use pre-positioned stretcher outside vehicle`,
        `Package management: ${isEV ? 'Keep defibrillator away from HV cables/connections' : 'Use caution with electronic medical devices near unstable electrical system'}`,
        `Lift coordination: Multiple rescuers for proper load distribution - never jerk or twist patient`,
        `Final clearance check: Ensure no broken glass, sharp edges, or hanging metal sheets contact patient during removal`,
        `Post-removal: Move to safe distance; do not leave vehicle unattended as fire risk may increase`
      ]
    });

    // STEP 6: Hazard-Specific Final Steps
    if (isEV || hasFuel || vehicleAge > 20) {
      steps.push({
        number: 6,
        title: `Post-Extrication - Special Hazards for ${this.model || 'This Vehicle'}`,
        details: [
          isEV ? `Battery fire risk: ${yearNum >= 2020 ? 'Newer EV batteries can reignite hours after extrication. Keep fire watch active. Have EV-rated extinguisher (Class D) ready.' : 'Monitor for thermal runaway. Contact manufacturer for battery location and cooling protocols.'}` : '',
          isEV ? `HV system still active: Warn all personnel - do not touch any orange/red colored cables or components` : '',
          hasFuel ? `Fuel system containment: ${vehicleAge < 5 ? 'Modern vehicles have robust fuel shutoff. Still check for leaks. Fuel may be under pressure.' : 'Older vehicles may continue leaking. Deploy absorbent and establish hot zone.'}` : '',
          vehicleAge > 20 ? `Asbestos hazard: ${vehicleAge} year old vehicle may contain brake pads, insulation, and gaskets with asbestos. Use respiratory protection if cutting.` : '',
          hasFuel && vehicleAge < 3 ? `Direct injection hazard: Fuel injectors are extremely high pressure. Do not cut near fuel rail.` : '',
          `Vehicle documentation: Obtain VIN and vehicle registration; alert towing service to hazards (EV? Fuel leak?)`,
          `Incident documentation: Note all tools used, cuts made, and special hazards encountered for insurance and safety review`
        ].filter(d => d)
      });
    }

    return steps;
  }
}
