import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ChatHistorySidebar } from './chat-history-sidebar';

describe('ChatHistorySidebar', () => {
  let component: ChatHistorySidebar;
  let fixture: ComponentFixture<ChatHistorySidebar>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatHistorySidebar],
    }).compileComponents();

    fixture = TestBed.createComponent(ChatHistorySidebar);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
