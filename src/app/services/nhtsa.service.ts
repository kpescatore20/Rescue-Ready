import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap, switchMap, catchError } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class NhtsaService {
  constructor(private http: HttpClient) {}

  // Fetch SafetyRatings from NHTSA for given year/make/model
  searchSafetyRatings(year: string, make: string, model: string): Observable<any> {
    if (!year || year === 'All' || !make || make === 'All' || !model || model === 'All') {
      return of(null);
    }

    const url = `https://api.nhtsa.gov/SafetyRatings/modelyear/${encodeURIComponent(year)}/make/${encodeURIComponent(make)}/model/${encodeURIComponent(model)}?format=json`;
    const cacheKey = `nhtsa:safety:${year}:${make}:${model}`;

    console.log('NHTSA request params', { year, make, model, url });

    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        console.log('NHTSA returning cached response', { cacheKey, parsed });
        return of(parsed);
      } catch { /* fallthrough */ }
    }

    // First call returns summary results which may include VehicleId. If present, fetch detailed ratings by VehicleId.
    return this.http.get<any>(url).pipe(
      switchMap(res => {
        console.log('NHTSA response (summary)', { cacheKey, res });
        try { localStorage.setItem(cacheKey, JSON.stringify(res)); } catch {}

        const first = res && res.Results && res.Results[0];
        const vehicleId = first && (first.VehicleId || first.VehicleId > 0) ? first.VehicleId : null;
        if (!vehicleId) { return of(res); }

        const vidCacheKey = `nhtsa:safety:vehicle:${vehicleId}`;
        const vehicleUrl = `https://api.nhtsa.gov/SafetyRatings/VehicleId/${encodeURIComponent(vehicleId)}?format=json`;
        const cachedVid = localStorage.getItem(vidCacheKey);
        if (cachedVid) {
          try { const parsed = JSON.parse(cachedVid); console.log('NHTSA returning cached vehicle response', { vidCacheKey, parsed }); return of(parsed); } catch {}
        }
        console.log('NHTSA fetching by VehicleId', { vehicleId, vehicleUrl });
        return this.http.get<any>(vehicleUrl).pipe(tap(vehicleRes => {
          console.log('NHTSA response (vehicle)', { vidCacheKey, vehicleRes });
          try { localStorage.setItem(vidCacheKey, JSON.stringify(vehicleRes)); } catch {}
        }), catchError(err => {
          console.error('Error fetching NHTSA VehicleId data', err);
          return of(res);
        }));
      }),
      catchError(err => { console.error('NHTSA searchSafetyRatings failed', err); return of({ error:true, message: err?.message || String(err) }); })
    );
  }

  // Step 1: Get all available Model Years
  getAvailableModelYears(): Observable<any> {
    const url = `https://api.nhtsa.gov/SafetyRatings?format=json`;
    const cacheKey = `nhtsa:safety:years`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try { return of(JSON.parse(cached)); } catch {}
    }
    return this.http.get<any>(url).pipe(tap(res => {
      try { localStorage.setItem(cacheKey, JSON.stringify(res)); } catch {}
      console.log('NHTSA available model years', res);
    }), catchError(err => { console.error('Error fetching model years', err); return of({ error:true, message: err?.message || String(err) }); }));
  }

  // Step 2: Get all Makes for a given Model Year via SafetyRatings endpoint
  getMakesForYear(year: string): Observable<any> {
    if (!year) return of(null);
    const url = `https://api.nhtsa.gov/SafetyRatings/modelyear/${encodeURIComponent(year)}?format=json`;
    const cacheKey = `nhtsa:safety:makes:${year}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try { return of(JSON.parse(cached)); } catch {}
    }
    return this.http.get<any>(url).pipe(tap(res => {
      try { localStorage.setItem(cacheKey, JSON.stringify(res)); } catch {}
      console.log('NHTSA makes for year', year, res);
    }), catchError(err => { console.error('Error fetching makes for year', err); return of({ error:true, message: err?.message || String(err) }); }));
  }

  // Step 3: Get all Models for the Make and Model Year via SafetyRatings
  getModelsForMakeYearSafety(year: string, make: string): Observable<any> {
    if (!year || !make) return of(null);
    const url = `https://api.nhtsa.gov/SafetyRatings/modelyear/${encodeURIComponent(year)}/make/${encodeURIComponent(make)}?format=json`;
    const cacheKey = `nhtsa:safety:models:${year}:${make}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try { return of(JSON.parse(cached)); } catch {}
    }
    return this.http.get<any>(url).pipe(tap(res => {
      try { localStorage.setItem(cacheKey, JSON.stringify(res)); } catch {}
      console.log('NHTSA models for year+make', { year, make, res });
    }), catchError(err => { console.error('Error fetching models for make/year', err); return of({ error:true, message: err?.message || String(err) }); }));
  }

  // Step 4: Get available vehicle variants for a selected Model Year/Make/Model
  // This reuses the SafetyRatings modelyear/make/model endpoint and returns the Results array
  getVariants(year: string, make: string, model: string): Observable<any> {
    if (!year || !make || !model) return of(null);
    const url = `https://api.nhtsa.gov/SafetyRatings/modelyear/${encodeURIComponent(year)}/make/${encodeURIComponent(make)}/model/${encodeURIComponent(model)}?format=json`;
    const cacheKey = `nhtsa:safety:variants:${year}:${make}:${model}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try { return of(JSON.parse(cached)); } catch {}
    }
    return this.http.get<any>(url).pipe(tap(res => {
      try { localStorage.setItem(cacheKey, JSON.stringify(res)); } catch {}
      console.log('NHTSA variants for y/m/m', { year, make, model, res });
    }), catchError(err => { console.error('Error fetching variants', err); return of({ error:true, message: err?.message || String(err) }); }));
  }

  // Step 5: Get Safety Ratings by VehicleId
  getSafetyByVehicleId(vehicleId: string | number): Observable<any> {
    if (!vehicleId) return of(null);
    const url = `https://api.nhtsa.gov/SafetyRatings/VehicleId/${encodeURIComponent(String(vehicleId))}?format=json`;
    const cacheKey = `nhtsa:safety:vehicle:${vehicleId}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try { return of(JSON.parse(cached)); } catch {}
    }
    return this.http.get<any>(url).pipe(tap(res => {
      try { localStorage.setItem(cacheKey, JSON.stringify(res)); } catch {}
      console.log('NHTSA safety by VehicleId', vehicleId, res);
    }), catchError(err => { console.error('Error fetching safety by VehicleId', err); return of({ error:true, message: err?.message || String(err) }); }));
  }

  
  // vPIC removed from service: remaining methods focus on SafetyRatings endpoints
  // vPIC: decode VIN to get many variables (useful to detect airbag presence flags)
  decodeVinValues(vin: string): Observable<any> {
    if (!vin) return of(null);
    const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`;
    const cacheKey = `nhtsa:vpic:decode:${vin}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try { return of(JSON.parse(cached)); } catch {}
    }
    return this.http.get<any>(url).pipe(tap(res => {
      try { localStorage.setItem(cacheKey, JSON.stringify(res)); } catch {}
      console.log('vPIC decode VIN', vin, res && res.Results && res.Results[0]);
    }), catchError(err => { console.error('Error decoding VIN with vPIC', err); return of({ error:true, message: err?.message || String(err) }); }));
  }
}
