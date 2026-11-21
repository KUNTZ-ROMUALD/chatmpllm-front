import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdminProvidersPage } from './admin-providers-page';

describe('AdminProvidersPage', () => {
  let component: AdminProvidersPage;
  let fixture: ComponentFixture<AdminProvidersPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminProvidersPage],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminProvidersPage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
