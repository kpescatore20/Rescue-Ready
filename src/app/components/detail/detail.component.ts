import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Vehicle, VehicleService } from '../../services/vehicle.service';

@Component({
  selector: 'app-detail',
  templateUrl: './detail.component.html',
  styleUrls: ['./detail.component.scss']
})
export class DetailComponent implements OnInit {
  vehicle: Vehicle | null = null;

  constructor(private route: ActivatedRoute, private vs: VehicleService) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.vs.getAll().subscribe(list => {
      this.vehicle = list.find(v => v.id === id) || null;
    });
  }

  printRescueSheet() {
    if (!this.vehicle) { return; }
    if (this.vehicle.rescueSheetLink) {
      window.open(this.vehicle.rescueSheetLink, '_blank');
      return;
    }

    const v = this.vehicle;
    const content = `
      <html>
        <head>
          <title>Rescue Sheet - ${v.make} ${v.model} (${v.year})</title>
        </head>
        <body>
          <h1>${v.make} ${v.model} (${v.year})</h1>
          <p><strong>Crash Rating:</strong> ${v.crashTestRating}</p>
          <p><strong>Fuel:</strong> ${v.fuelType}</p>
          <p><strong>Battery:</strong> ${v.highVoltageBattery ? 'High-voltage — ' + (v.batteryLocation||'') : (v.batteryLocation||'') }</p>
          <p><strong>Extrication:</strong> ${v.extricationNotes || ''}</p>
        </body>
      </html>
    `;

    const w = window.open('', '_blank');
    if (!w) { alert('Unable to open print window'); return; }
    w.document.write(content);
    w.document.close();
    w.focus();
    w.print();
  }

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

  isExternalVideoService(val: any): boolean {
    if (!val || typeof val !== 'string') return false;
    return /youtube\.com|youtu\.be|vimeo\.com/i.test(val);
  }

  // Safely coerce to array for *ngFor
  getArray(val: any): any[] {
    if (!val && val !== 0) return [];
    if (Array.isArray(val)) return val;
    return [val];
  }
}
