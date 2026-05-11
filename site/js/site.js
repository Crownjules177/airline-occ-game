const POSTS = [
  {
    slug: "friction-is-signal",
    title: "The friction is signal, not failure",
    tag: "essay",
    date: "2025-05-09",
    excerpt: "Inside organisations, the people slowing down AI adoption are typically framed as the problem. Systemically, they are the only feedback mechanism the organisation has.",
    body: `
<p>Inside organisations, the people slowing down AI adoption are typically framed as the problem. The blockers. The laggards. The ones who "don't get it."</p>

<p>Systemically, they are the only feedback mechanism the organisation has.</p>

<p>Friction is the lived experience of risk, value conflict, and "this doesn't feel right" — translated into bureaucratic drag because that's the only available language. The paralegal who keeps asking for one more review. The IT manager who insists on another security assessment. The senior who quietly disagrees with the rollout timeline.</p>

<p>None of them have the vocabulary to say what they're actually sensing. The system doesn't give them one. So they use the only tool available: they slow things down.</p>

<h2>The question isn't how to remove the friction</h2>

<p>It's: what is the friction trying to say?</p>

<p>In complex, fast-moving systems, leaders increasingly ratify momentum rather than generate it. They are not at the wheel — they are the most prestigious passengers with the best view of where the car is going. When a frontier AI leader says "I'm just one person, what can I do?" — they are being precise, not self-pitying.</p>

<p>The AI arms race has no single author. No leader chose speed as a terminal value. Speed emerged from competitive game theory: any actor that slows unilaterally cedes ground. The result is a coordination failure at civilisational scale.</p>

<p>This dynamic replicates inside every organisation. The instruction to "move fast with AI" cannot be traced to a single decision. It arrives through competitor announcements, board pressure, consultant decks, and fear. It is emergent.</p>

<h2>Friction as intelligence</h2>

<p>If collaboration is humanity's superpower — and the evolutionary, historical, and organisational evidence says it is — then the feedback mechanisms inside collaborative systems are not bugs. They are the system's immune response.</p>

<p>When we build instruments that can translate friction into legible signal, two things happen:</p>

<ul>
<li>Leaders get information they currently can't access — the felt reality of what's happening at the edges of the system</li>
<li>The people experiencing friction get a language for what they're sensing — which turns anxiety into contribution</li>
</ul>

<p>That's what Human Value is building toward. Not removing friction. Making it readable.</p>
`
  },
  {
    slug: "ai-brief-week-19",
    title: "AI Brief: Week 19 — The measurement gap is the strategy gap",
    tag: "brief",
    date: "2025-05-05",
    excerpt: "What struck me this week: every major AI announcement is a deployment decision. And almost none of them reference what they're displacing.",
    body: `
<p>What struck me this week: every major AI announcement is a deployment decision. And almost none of them reference what they're displacing.</p>

<p>A new model is released. It benchmarks higher on reasoning tasks. Companies announce integration plans within hours. The question that never gets asked: what was the human intelligence doing in that slot, and what happens to the system when it's removed?</p>

<h2>The measurement gap</h2>

<p>We have extraordinarily sophisticated instruments for measuring AI capability. Benchmarks, evals, red-teaming frameworks, safety assessments. The AI side of the map is being drawn with increasing precision.</p>

<p>We have almost nothing for measuring the human intelligence that AI is being deployed alongside — or in place of. No equivalent instruments. No quality maps. No way to see what a person actually carries into a system versus what their job description says they do.</p>

<p>This asymmetry is not a research curiosity. It's a strategy gap. Every deployment decision made without understanding the human side is a bet made with half the information.</p>

<h2>What I'm watching</h2>

<ul>
<li><strong>Model welfare research</strong> is maturing fast. Anthropic and others are building serious frameworks for understanding what conditions produce high-quality AI output. This is the AI side of quality-based coordination, and it's moving.</li>
<li><strong>The "AI jobs" conversation</strong> remains stuck in replacement framing. Almost every headline asks "will AI take X job?" rather than "what does X person carry that the system needs?"</li>
<li><strong>Internal friction</strong> in large organisations is rising as deployment pressure increases. I'm hearing the same pattern everywhere: leadership wants speed, middle management feels something is wrong, nobody has the language for it.</li>
</ul>

<h2>The brief version</h2>

<p>Until we can see human intelligence with the same precision we see AI capability, every deployment decision is half-blind. The measurement gap is not a nice-to-have. It is the strategy gap.</p>
`
  },
  {
    slug: "collaboration-superpower",
    title: "Collaboration isn't a soft skill. It's the entire basis of civilisation.",
    tag: "essay",
    date: "2025-04-28",
    excerpt: "Every major human leap was produced by accumulated collaborative knowledge across people and time. Every major collapse has a collaboration failure at its core.",
    body: `
<p>This is the claim I keep coming back to, and the one that gets the most pushback. So let me make the case.</p>

<h2>The biological baseline</h2>

<p>Humans have "shared intentionality" — the ability to build a joint mental model with others and work toward it. No other primate does this at scale. Other species cooperate. Other species communicate. But the ability to hold a shared representation of a goal that doesn't yet exist and coordinate toward it with strangers — that's uniquely human.</p>

<p>We coordinate with millions of people we'll never meet. That capacity is the entire basis of civilisation.</p>

<h2>The historical record</h2>

<p>Every major human leap — agriculture, writing, the scientific revolution, industrialisation — was produced by accumulated collaborative knowledge across people and time. Newton's "shoulders of giants" was a precise description of how human progress actually works. Ideas compound across people and generations. That compounding is collaboration.</p>

<h2>The counter-evidence</h2>

<p>If the positive case isn't convincing enough, look at the failures. Every major civilisational collapse studied has a collaboration failure at its core. Either elite capture broke the feedback loop between leaders and reality, or coordination collapsed and nobody could arrest it.</p>

<p>Fragility lives in the connective tissue, not the individual nodes.</p>

<h2>What this means for AI</h2>

<p>If collaboration is what produced everything good about human civilisation, it's also the most plausible foundation for the next era — including how we integrate artificial intelligence into our world.</p>

<p>The question is not "how smart is the AI?" or "how smart is the person?" It's: what becomes possible when their different kinds of intelligence are in right relationship?</p>

<p>That question only makes sense if you believe collaboration is generative — that the combination produces something neither could alone. The evidence says it does. It always has.</p>
`
  }
];

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function renderPostCard(post) {
  return `
    <a href="post.html#${post.slug}" class="post-card">
      <span class="post-card-tag">${post.tag}</span>
      <span class="post-card-title">${post.title}</span>
      <span class="post-card-excerpt">${post.excerpt}</span>
      <span class="post-card-date">${formatDate(post.date)}</span>
    </a>
  `;
}

function renderPostListItem(post) {
  return `
    <a href="post.html#${post.slug}" class="post-list-item" data-tag="${post.tag}">
      <div class="post-list-header">
        <span class="post-list-title">${post.title}</span>
        <span class="post-list-tag">${post.tag}</span>
      </div>
      <div class="post-list-excerpt">${post.excerpt}</div>
      <div class="post-list-date">${formatDate(post.date)}</div>
    </a>
  `;
}

function initLatestPosts() {
  const container = document.getElementById('latest-posts');
  if (!container) return;
  container.innerHTML = POSTS.slice(0, 3).map(renderPostCard).join('');
}

function initPostsList() {
  const container = document.getElementById('posts-container');
  if (!container) return;

  function render(filter) {
    const filtered = filter === 'all' ? POSTS : POSTS.filter(p => p.tag === filter);
    if (filtered.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>No posts yet in this category. Check back soon.</p></div>';
    } else {
      container.innerHTML = filtered.map(renderPostListItem).join('');
    }
  }

  render('all');

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      render(btn.dataset.filter);
    });
  });
}

function initPost() {
  const titleEl = document.getElementById('post-title');
  if (!titleEl) return;

  const slug = window.location.hash.slice(1);
  const post = POSTS.find(p => p.slug === slug);

  if (!post) {
    titleEl.textContent = 'Post not found';
    return;
  }

  document.title = `${post.title} — Human Value`;
  titleEl.textContent = post.title;
  document.getElementById('post-tag').textContent = post.tag;
  document.getElementById('post-date').textContent = formatDate(post.date);
  document.getElementById('post-body').innerHTML = post.body;
}

function initMobileNav() {
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  if (!toggle || !links) return;

  toggle.addEventListener('click', () => {
    links.classList.toggle('open');
    const spans = toggle.querySelectorAll('span');
    if (links.classList.contains('open')) {
      spans[0].style.transform = 'rotate(45deg) translate(5px, 5px)';
      spans[1].style.opacity = '0';
      spans[2].style.transform = 'rotate(-45deg) translate(5px, -5px)';
    } else {
      spans[0].style.transform = '';
      spans[1].style.opacity = '';
      spans[2].style.transform = '';
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initLatestPosts();
  initPostsList();
  initPost();
  initMobileNav();
});
