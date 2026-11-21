import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProvidersPage } from './providers-page';

describe('ProvidersPage', () => {
  let component: ProvidersPage;
  let fixture: ComponentFixture<ProvidersPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProvidersPage],
    }).compileComponents();

    fixture = TestBed.createComponent(ProvidersPage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
