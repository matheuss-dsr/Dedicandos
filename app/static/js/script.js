document.addEventListener("DOMContentLoaded", () => {
  const hamburger = document.getElementById("hamburger");
  const menu = document.getElementById("menu");
  const navbar = document.getElementById("navbar");
  const avatarBtn = document.getElementById("avatarBtn");
  const userMenu = document.getElementById("userMenu");
  const avatarOverlay = document.querySelector(".avatar-section .overlay");
  const avatarInput = document.getElementById("avatarInput");

  if (hamburger && menu) {
    hamburger.addEventListener("click", () => menu.classList.toggle("active"));

    // Fecha o menu ao clicar em um link
    menu.querySelectorAll("a").forEach(link => {
      link.addEventListener("click", () => menu.classList.remove("active"));
    });
  }

  let lastScrollTop = 0;
  if (navbar) {
    window.addEventListener("scroll", () => {
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      navbar.classList.toggle("hide", scrollTop > lastScrollTop);
      navbar.classList.toggle("show", scrollTop <= lastScrollTop);
      lastScrollTop = scrollTop <= 0 ? 0 : scrollTop;
    });
  }

  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener("click", e => {
      e.preventDefault();
      const targetElement = document.querySelector(anchor.getAttribute("href"));
      if (targetElement) {
        const navbarHeight = navbar ? navbar.offsetHeight : 0;
        window.scrollTo({
          top: targetElement.offsetTop - navbarHeight,
          behavior: "smooth"
        });
      }
      menu?.classList.remove("active");
    });
  });

  if (avatarBtn && userMenu) {
    avatarBtn.addEventListener("click", e => {
      e.stopPropagation();
      userMenu.classList.toggle("open");
    });

    document.addEventListener("click", () => userMenu.classList.remove("open"));
    userMenu.addEventListener("click", e => e.stopPropagation());
  }

  if (avatarOverlay && avatarInput) {
    avatarOverlay.addEventListener("click", e => {
      e.stopPropagation();
      avatarInput.click();
    });

    avatarInput.addEventListener("change", () => avatarInput.form.submit());
  }

  const switchToCadastro = document.querySelector(".switch-to-cadastro");
  const switchToLogin = document.querySelector(".switch-to-login");
  const container = document.querySelector(".auth-wrapper");
  const image = document.querySelector(".auth-image img");

  if (switchToCadastro && container && image) {
    switchToCadastro.addEventListener("click", e => {
      e.preventDefault();
      image.classList.add("fade-out");

      setTimeout(() => {
        container.classList.add("show-cadastro");
        image.src = "/static/images/cadastro-img.png";
        image.classList.remove("fade-out");
      }, 500);
    });
  }

  if (switchToLogin && container && image) {
    switchToLogin.addEventListener("click", e => {
      e.preventDefault();
      image.classList.add("fade-out");

      setTimeout(() => {
        container.classList.remove("show-cadastro");
        image.src = "/static/images/login-img.png";
        image.classList.remove("fade-out");
      }, 500);
    });
  }
});
