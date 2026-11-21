import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RichMessage } from './rich-message';

describe('RichMessage', () => {
  let component: RichMessage;
  let fixture: ComponentFixture<RichMessage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RichMessage],
    }).compileComponents();

    fixture = TestBed.createComponent(RichMessage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
