import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MathExpression } from './math-expression';

describe('MathExpression', () => {
  let component: MathExpression;
  let fixture: ComponentFixture<MathExpression>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MathExpression],
    }).compileComponents();

    fixture = TestBed.createComponent(MathExpression);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
