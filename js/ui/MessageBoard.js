import { Clock } from '../systems/Clock.js';
import { DEPARTMENT_INFO } from '../data/names.js';

export class MessageBoard {
  constructor(gameState) {
    this.state = gameState;
    this.listEl = document.getElementById('message-list');
    this.messages = [];
  }

  addMessage(type, source, text) {
    const gameTime = this.state.get('gameTime');
    const timeStr = Clock.formatTime(gameTime);
    const deptInfo = DEPARTMENT_INFO[type];
    const color = deptInfo ? deptInfo.color : (type === 'decision' ? '#f59e0b' : '#6b7280');
    const label = deptInfo ? deptInfo.name.split('/')[0].trim().substring(0, 12) : source;

    const msg = { time: timeStr, type, source: label, text, color };
    this.messages.unshift(msg);

    // Keep max 100 messages
    if (this.messages.length > 100) this.messages.pop();

    this._renderMessage(msg);
  }

  _renderMessage(msg) {
    const div = document.createElement('div');
    div.className = `message-item ${msg.type}`;
    div.innerHTML = `
      <span class="message-time">${msg.time}</span>
      <span class="message-dept" style="color:${msg.color}">${msg.source}</span>
      <span class="message-text">${msg.text}</span>
    `;
    this.listEl.prepend(div);

    // Keep DOM size manageable
    while (this.listEl.children.length > 100) {
      this.listEl.removeChild(this.listEl.lastChild);
    }
  }

  clear() {
    this.messages = [];
    this.listEl.innerHTML = '';
  }
}
