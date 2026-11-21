import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ApiKeysPage } from './api-keys-page';

describe('ApiKeysPage', () => {
  let component: ApiKeysPage;
  let fixture: ComponentFixture<ApiKeysPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ApiKeysPage],
    }).compileComponents();

    fixture = TestBed.createComponent(ApiKeysPage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
