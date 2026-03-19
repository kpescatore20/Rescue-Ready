import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  crashTestRating?: number;
  doorCount?: number;
  fuelType?: string;
  highVoltageBattery?: boolean;
  batteryLocation?: string | null;
  extricationNotes?: string | null;
  roofStrength?: string | null;
  rescueSheetLink?: string | null;
  images?: string[];
}

@Injectable({ providedIn: 'root' })
export class VehicleService {
  private url = 'assets/data/vehicles.json';

  constructor(private http: HttpClient) {}

  getAll(): Observable<Vehicle[]> {
    return this.http.get<Vehicle[]>(this.url);
  }

  // Simple client-side filter
  search(term: string): Observable<Vehicle[]> {
    return new Observable((observer) => {
      this.getAll().subscribe(list => {
        const t = term.trim().toLowerCase();
        if (!t) { observer.next(list); observer.complete(); return; }
        const filtered = list.filter(v => (`${v.make} ${v.model} ${v.year}`).toLowerCase().includes(t));
        observer.next(filtered);
        observer.complete();
      }, err => observer.error(err));
    });
  }
}
