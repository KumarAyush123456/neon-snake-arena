import { networkManager } from './network.js';

export class LobbySystem {
  constructor() {
    this.chatFeed = document.getElementById('chatFeed');
    this.chatInput = document.getElementById('chatInput');
    this.btnSendChat = document.getElementById('btnSendChat');
    
    // List of mock bots to chat
    this.chatterNames = [
      'Byte_Hunter', 'GridRunner', 'ApexSlayer', 'Glitch_Master',
      'PixelMamba', 'CypherNode', 'Zero_Cool', 'RivalPilot',
      'NullPointer', 'LaserStrike', 'ShadowSnake', 'VaporGlider',
      'LobbyAdmin', 'RetroGamer'
    ];

    // Generic messages for background chat activity
    this.chatTemplates = [
      "Room 3 is absolute chaos right now, avoid the corners!",
      "Just got cut off by a bot... absolute wall hack.",
      "Who's got the current Daily Arena record?",
      "Finally unlocked the Fire Skin! Looks insane on the grid 🔥",
      "Anyone down for a 1v1 Cyberspace duel?",
      "Need more coins, that Rainbow skin is expensive.",
      "Lobby is filling up. 18 pilots in matchmaking.",
      "Is anyone else experiencing grid latency, or is it just my connection?",
      "Pro tip: Grab the shield node and force collisions. Works every time.",
      "Just reached length 55! Almost made it to the top slot.",
      "GGs to whoever was playing in Arena 12 just now.",
      "Matrix skin is highly underrated, green blocks match the vibe."
    ];

    // Response maps for interactive user chat
    this.keywordResponses = {
      'hello': ["Yo, welcome to the Arena!", "Hey pilot, ready to crash?", "What's up! Choose your grid node."],
      'hi': ["Hey!", "Welcome to Neon Arena", "Prepare to get sliced!"],
      'noob': ["Who are you calling a noob? Meet me in AI Battle.", "Hey, I'm trying my best here ok."],
      'hack': ["No hacks, just pure neural pathfinding.", "Sounds like skill issue tbh.", "Reported to grid admin! Just kidding."],
      'skin': ["You can unlock skins in the Shop using coins!", "Rainbow skin is the ultimate flex.", "Fire skin has particle effects!"],
      'score': ["My record is 1200. Beat that!", "Getting past 800 is tough.", "I'm pushing for 2k today."]
    };

    this.setupEventListeners();
    this.startChatSimulation();
  }

  setupEventListeners() {
    // Send message triggers
    this.btnSendChat.addEventListener('click', () => this.handleUserMessage());
    this.chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.handleUserMessage();
    });

    // Listen for custom in-game events to post announcements
    window.addEventListener('achievement_unlocked', (e) => {
      const ach = e.detail;
      this.postSystemMessage(`Announcement: Pilot 'player' unlocked [${ach.title}] - ${ach.desc}! 🎉`);
    });

    window.addEventListener('arena_kill', (e) => {
      const data = e.detail;
      const reactions = [
        `NO WAY! ${data.killer} absolutely demolished ${data.victim}! 🤯`,
        `RIP ${data.victim}, got cut off hard by ${data.killer}.`,
        `${data.killer} is on a rampage! Neutralized ${data.victim}.`,
        `Clean sweep by ${data.killer}. Ouch.`
      ];
      this.postBotMessage(
        this.chatterNames[Math.floor(Math.random() * this.chatterNames.length)],
        reactions[Math.floor(Math.random() * reactions.length)]
      );
    });
  }

  startChatSimulation() {
    // Inject a greeting message immediately
    this.postSystemMessage("Welcome to Neon Snake Arena Lobby. All grid sectors operational.");
  }

  postBotMessage(author, text) {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const msgEl = document.createElement('div');
    msgEl.className = 'chat-msg';
    msgEl.innerHTML = `
      <div class="chat-msg-header">
        <span class="chat-author">${author}</span>
        <span class="chat-time">${time}</span>
      </div>
      <div class="chat-body">${text}</div>
    `;
    this.chatFeed.appendChild(msgEl);
    this.scrollChatToBottom();
  }

  postSystemMessage(text) {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const msgEl = document.createElement('div');
    msgEl.className = 'chat-msg system';
    msgEl.innerHTML = `
      <div class="chat-msg-header">
        <span class="chat-author">SYSTEM_NODE</span>
        <span class="chat-time">${time}</span>
      </div>
      <div class="chat-body">${text}</div>
    `;
    this.chatFeed.appendChild(msgEl);
    this.scrollChatToBottom();
  }

  handleUserMessage() {
    const text = this.chatInput.value.trim();
    if (!text) return;

    this.chatInput.value = '';

    if (networkManager.isConnected) {
      networkManager.sendChat(text);
      return;
    }

    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    // Append user message
    const msgEl = document.createElement('div');
    msgEl.className = 'chat-msg';
    msgEl.innerHTML = `
      <div class="chat-msg-header">
        <span class="chat-author user">You (Pilot)</span>
        <span class="chat-time">${time}</span>
      </div>
      <div class="chat-body">${text}</div>
    `;
    this.chatFeed.appendChild(msgEl);
    this.scrollChatToBottom();

    // Trigger simulated reply
    this.triggerSimulatedReply(text);
  }

  triggerSimulatedReply(userText) {
    const lowerText = userText.toLowerCase();
    let replyOptions = null;

    // Check keywords
    for (let key in this.keywordResponses) {
      if (lowerText.includes(key)) {
        replyOptions = this.keywordResponses[key];
        break;
      }
    }

    // Default responses if no keyword matched
    if (!replyOptions) {
      replyOptions = [
        "Interesting strategy, tell me more.",
        "Nice. Who is entering the next match?",
        "Watch your back in the arena!",
        "Alright, good luck out there pilot.",
        "Grid cells are waiting."
      ];
    }

    // Random delay between 800ms and 1800ms to feel real
    const delay = Math.random() * 1000 + 800;
    setTimeout(() => {
      const author = this.chatterNames[Math.floor(Math.random() * this.chatterNames.length)];
      const reply = replyOptions[Math.floor(Math.random() * replyOptions.length)];
      this.postBotMessage(author, reply);
    }, delay);
  }

  scrollChatToBottom() {
    this.chatFeed.scrollTop = this.chatFeed.scrollHeight;
  }

  // Simulated Online Matchmaking Queue
  startMatchmaking(onQueueComplete) {
    const queueStatus = document.getElementById('queueStatus');
    const queueText = document.getElementById('queueText');
    const launchBtn = document.getElementById('btnLaunchGame');
    
    queueStatus.classList.remove('hidden');
    launchBtn.disabled = true;
    
    const steps = [
      "Pinging local grid sectors...",
      "Matching with 8 active neural bots...",
      "Allocating spatial arena coordinates...",
      "Syncing grid clock nodes...",
      "Ready for launch!"
    ];

    let currentStep = 0;
    
    const runStep = () => {
      if (currentStep >= steps.length) {
        queueStatus.classList.add('hidden');
        launchBtn.disabled = false;
        onQueueComplete(); // launch
        return;
      }

      queueText.innerText = steps[currentStep];
      currentStep++;
      
      const stepDuration = Math.random() * 500 + 400; // 400ms - 900ms per step
      setTimeout(runStep, stepDuration);
    };

    runStep();
  }
}
