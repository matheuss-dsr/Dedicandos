document.addEventListener("DOMContentLoaded", () => {
  // =========================
  // MENU HAMBÚRGUER
  // =========================
  const hamburger = document.getElementById("hamburger");
  const menu = document.getElementById("menu");
  const navbar = document.getElementById("navbar");

  if (hamburger && menu) {
    hamburger.addEventListener("click", () => {
      menu.classList.toggle("active");
    });

    // Fecha o menu ao clicar em um link
    document.querySelectorAll(".menu a").forEach(link => {
      link.addEventListener("click", () => {
        menu.classList.remove("active");
      });
    });
  }

  // =========================
  // ESCONDER/EXIBIR NAVBAR AO ROLAR
  // =========================
  let lastScrollTop = 0;

  if (navbar) {
    window.addEventListener("scroll", () => {
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

      if (scrollTop > lastScrollTop) {
        navbar.classList.add("hide");
        navbar.classList.remove("show");
      } else {
        navbar.classList.add("show");
        navbar.classList.remove("hide");
      }

      lastScrollTop = scrollTop <= 0 ? 0 : scrollTop;
    });
  }

  // =========================
  // SCROLL SUAVE PARA ÂNCORAS (#)
  // =========================
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener("click", function (e) {
      e.preventDefault();

      const targetId = this.getAttribute("href");
      const targetElement = document.querySelector(targetId);

      if (targetElement) {
        const navbarHeight = navbar ? navbar.offsetHeight : 0;
        const elementPosition = targetElement.offsetTop - navbarHeight;

        window.scrollTo({
          top: elementPosition,
          behavior: "smooth"
        });
      }

      if (menu) menu.classList.remove("active");
    });
  });

  // =========================
  // MENU DO USUÁRIO (AVATAR)
  // =========================
  const avatarBtn = document.getElementById("avatarBtn");
  const userMenu = document.getElementById("userMenu");

  if (avatarBtn && userMenu) {
    avatarBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      userMenu.style.display = userMenu.style.display === "flex" ? "none" : "flex";
    });

    document.addEventListener("click", () => {
      userMenu.style.display = "none";
    });

    userMenu.addEventListener("click", (e) => e.stopPropagation());
  }

// =========================
// AVATAR - TROCAR FOTO
// =========================
const avatarOverlay = document.querySelector(".avatar-section .overlay"); // só o overlay
const avatarInput = document.getElementById("avatarInput");

if (avatarOverlay && avatarInput) {
  // Ao clicar no overlay
  avatarOverlay.addEventListener("click", (e) => {
    e.stopPropagation(); // previne propagação de clique
    avatarInput.click(); // abre o seletor de arquivos
  });

  // Envia o formulário automaticamente após escolher a imagem
  avatarInput.addEventListener("change", () => {
    avatarInput.form.submit();
  });
}

});
