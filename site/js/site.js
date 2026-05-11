// Site logic — POSTS data is loaded from posts.js

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

  function renderFromHash() {
    const slug = window.location.hash.slice(1);
    const post = POSTS.find(p => p.slug === slug);

    if (!post) {
      titleEl.textContent = 'Post not found';
      document.getElementById('post-tag').textContent = '';
      document.getElementById('post-date').textContent = '';
      document.getElementById('post-body').innerHTML = '';
      return;
    }

    document.title = `${post.title} — Human Value`;
    titleEl.textContent = post.title;
    document.getElementById('post-tag').textContent = post.tag;
    document.getElementById('post-date').textContent = formatDate(post.date);
    document.getElementById('post-body').innerHTML = post.body;
    window.scrollTo(0, 0);
  }

  renderFromHash();
  window.addEventListener('hashchange', renderFromHash);
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
