if (!window.sessionStorage.getItem('gramsci_game_prompted')) {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
    
    if (isMobile) {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.8);backdrop-filter:blur(10px);z-index:9999;display:flex;justify-content:center;align-items:center;padding:2rem;flex-direction:column;text-align:center;color:white;';
        
        overlay.innerHTML = `
            <div class="box-glass p-3">
                <h1 style="margin-bottom:1rem;color:var(--primary); font-size:2rem;">¡Bienvenido Jugador!</h1>
                <p style="font-size:1.1rem;max-width:400px;margin-bottom:2rem;">Hemos detectado tu teléfono. ¿Deseas unirte como jugador a la "Guerra de Posiciones"?</p>
                <div style="display:flex;gap:1rem;flex-direction:column;width:100%;max-width:300px; margin:0 auto;">
                    <button class="btn-primary" style="padding:1rem;" onclick="window.location.href='/jugar?mode=player'">🕹️ JUGAR AHORA</button>
                    <button class="btn-primary" style="background:transparent;border:1px solid rgba(255,255,255,0.2);" onclick="this.parentElement.parentElement.parentElement.remove(); window.sessionStorage.setItem('gramsci_game_prompted', 'true');">Solo ver el trabajo práctico</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
    }
}

// Modal Logic
const modal = document.getElementById('text-modal');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');
const closeModal = document.getElementById('close-modal');

if (modal && closeModal) {
    document.querySelectorAll('.clickable-card, .clickable-img').forEach(item => {
        item.addEventListener('click', () => {
            const isImg = item.classList.contains('clickable-img');
            if (isImg) {
                modalTitle.innerText = "Vista Detallada";
                modalBody.innerHTML = `<img src="${item.src}" style="width:100%; height:auto; border-radius:12px;">`;
                modal.classList.remove('hidden');
                return;
            }

            const title = item.getAttribute('data-title') || item.querySelector('h3')?.innerText || "Detalles";
            const fullContentNode = item.querySelector('.full-content');
            if (!fullContentNode) return;
            
            // Clean splits for neat paragraphs
            const rawText = fullContentNode.innerHTML;
            const pars = rawText.split('\\n').map(p => p.trim()).filter(p => p.length > 0)
                .map(p => `<p style="margin-bottom:1.2rem;">${p}</p>`).join('');
            
            modalTitle.innerText = title;
            modalBody.innerHTML = pars;
            modal.classList.remove('hidden');
        });
    });

    closeModal.addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', (e) => {
        if(e.target === modal) modal.classList.add('hidden');
    });
}

// Microphone Badge Toggle
const micToggle = document.getElementById('microphone-toggle');
if (micToggle) {
    micToggle.addEventListener('click', () => {
        document.querySelectorAll('.speaker-badge').forEach(badge => {
            badge.style.display = badge.style.display === 'none' ? '' : 'none';
        });
    });
}

// Intersection Observer for scroll animations
const observerOptions = {
  root: null,
  rootMargin: '0px',
  threshold: 0.15
};

const observer = new IntersectionObserver((entries, observer) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('in-view');
      // Optional: Stop observing once animated if we only want it to animate once
      // observer.unobserve(entry.target);
    }
  });
}, observerOptions);

document.addEventListener('DOMContentLoaded', () => {
  // Select all elements to observe
  const targets = document.querySelectorAll('.observe');
  targets.forEach(target => observer.observe(target));

  // Subtle parallax effect for background mesh
  const meshBg = document.querySelector('.mesh-bg');
  if (meshBg) {
    window.addEventListener('scroll', () => {
      const scrollY = window.scrollY;
      meshBg.style.transform = `translateY(${scrollY * 0.1}px) rotate(${scrollY * 0.02}deg)`;
    });
  }
  
  // Smooth scroll for nav links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const targetId = this.getAttribute('href');
      const targetEle = document.querySelector(targetId);
      if(targetEle) {
        targetEle.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    });
  });
});
