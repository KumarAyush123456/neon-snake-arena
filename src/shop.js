// ==========================================================================
// Cosmetics Store Frontend & Interactions
// ==========================================================================

import { store } from './store.js';

export class ShopSystem {
  constructor() {
    this.shopGrid = document.getElementById('shopGrid');
    
    // Skins database
    this.skins = [
      {
        id: 'neon-cyan',
        title: 'Cyan Horizon',
        desc: 'Default grid config. Sleek electric cyan segments with glowing eyes.',
        cost: 0,
        previewClass: 'preview-neon-cyan'
      },
      {
        id: 'neon-magenta',
        title: 'Magenta Laser',
        desc: 'Futuristic high-energy pink config. Leaves light traces on coordinates.',
        cost: 100,
        previewClass: 'preview-neon-magenta'
      },
      {
        id: 'matrix',
        title: 'Digital Matrix',
        desc: 'Retro hacker aesthetic. Scrolling binary segments with grid sync.',
        cost: 200,
        previewClass: 'preview-matrix'
      },
      {
        id: 'fire',
        title: 'Solar Flare',
        desc: 'Volatile thermal config. Segments flicker like hot plasma embers.',
        cost: 350,
        previewClass: 'preview-fire'
      },
      {
        id: 'rainbow',
        title: 'Chroma Prism',
        desc: 'The ultimate grid flex. Body segments cycle through the full color spectrum.',
        cost: 500,
        previewClass: 'preview-rainbow'
      }
    ];

    // Redraw whenever store updates coins/unlocks
    store.subscribe(() => this.render());
  }

  render() {
    if (!this.shopGrid) return;
    
    const unlocked = store.state.unlockedSkins;
    const equipped = store.state.selectedSkin;
    const playerCoins = store.state.coins;
    
    this.shopGrid.innerHTML = '';
    
    this.skins.forEach(skin => {
      const isUnlocked = unlocked.includes(skin.id);
      const isEquipped = equipped === skin.id;
      
      let buttonHtml = '';
      let cardClass = 'shop-card';
      
      if (isEquipped) {
        cardClass += ' equipped';
        buttonHtml = `<button class="btn btn-buy equipped-btn" disabled>Active</button>`;
      } else if (isUnlocked) {
        buttonHtml = `<button class="btn btn-secondary btn-buy equip-action-btn" data-skin="${skin.id}">Equip</button>`;
      } else {
        const canAfford = playerCoins >= skin.cost;
        buttonHtml = `
          <button class="btn btn-primary btn-buy buy-action-btn ${canAfford ? '' : 'disabled'}" 
                  data-skin="${skin.id}" data-cost="${skin.cost}" ${canAfford ? '' : 'disabled'}>
            Buy
          </button>
        `;
      }

      const priceHtml = skin.cost === 0 
        ? `<span class="price-tag free">Free</span>`
        : `<span class="price-tag">
            <svg class="coin-icon-small" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M9 10h4.5a2.5 2.5 0 0 1 0 5H9"/></svg>
            ${skin.cost}
          </span>`;

      const card = document.createElement('div');
      card.className = cardClass;
      card.innerHTML = `
        <div class="skin-preview-box">
          <div class="skin-line-demo ${skin.previewClass}"></div>
        </div>
        <div class="shop-card-info">
          <h3>${skin.title}</h3>
          <p>${skin.desc}</p>
        </div>
        <div class="shop-card-footer">
          ${priceHtml}
          ${buttonHtml}
        </div>
      `;
      
      this.shopGrid.appendChild(card);
    });

    this.bindEvents();
  }

  bindEvents() {
    // Equip click bindings
    this.shopGrid.querySelectorAll('.equip-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const skinId = e.currentTarget.getAttribute('data-skin');
        store.equipSkin(skinId);
      });
    });

    // Buy click bindings
    this.shopGrid.querySelectorAll('.buy-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const skinId = e.currentTarget.getAttribute('data-skin');
        const cost = parseInt(e.currentTarget.getAttribute('data-cost'), 10);
        
        if (store.unlockSkin(skinId, cost)) {
          // Immediately equip on purchase
          store.equipSkin(skinId);
        }
      });
    });
  }
}
export const shopSystem = new ShopSystem();
