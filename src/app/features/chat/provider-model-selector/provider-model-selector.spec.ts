import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProviderModelSelector } from './provider-model-selector';

describe('ProviderModelSelector', () => {
  let component: ProviderModelSelector;
  let fixture: ComponentFixture<ProviderModelSelector>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProviderModelSelector],
    }).compileComponents();

    fixture = TestBed.createComponent(ProviderModelSelector);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
