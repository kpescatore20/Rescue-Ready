import { Component, OnInit } from '@angular/core';
import { Vehicle, VehicleService } from '../../services/vehicle.service';

@Component({
  selector: 'app-search',
  templateUrl: './search.component.html',
  styleUrls: ['./search.component.scss']
})
export class SearchComponent implements OnInit {
  query = '';
  vehicles: Vehicle[] = [];
  displayedVehicles: Vehicle[] = [];
  batteryLocations: (string | null)[] = [];
  roofStrengths: (string | null)[] = [];
  selectedBatteryLocation: string = 'All';
  selectedRoofStrength: string = 'All';

  constructor(private vs: VehicleService) {}

  ngOnInit(): void {
    this.vs.getAll().subscribe(list => {
      this.vehicles = list;
      this.batteryLocations = Array.from(new Set(list.map(v => v.batteryLocation).filter(x => !!x)));
      this.roofStrengths = Array.from(new Set(list.map(v => v.roofStrength).filter(x => !!x)));
      this.applyFilters();
    });
  }

  onSearch() {
    this.applyFilters();
  }

  applyFilters() {
    const t = this.query.trim().toLowerCase();
    this.displayedVehicles = this.vehicles.filter(v => {
      const matchesQuery = !t || (`${v.make} ${v.model} ${v.year}`).toLowerCase().includes(t);
      const matchesBattery = this.selectedBatteryLocation === 'All' || (v.batteryLocation || 'Unknown') === this.selectedBatteryLocation;
      const matchesRoof = this.selectedRoofStrength === 'All' || (v.roofStrength || 'Unknown') === this.selectedRoofStrength;
      return matchesQuery && matchesBattery && matchesRoof;
    });
  }
}
