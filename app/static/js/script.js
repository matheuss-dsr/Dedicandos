// Menu hamburguer
      const hamburger = document.getElementById("hamburger");
      const menu = document.getElementById("menu");

      hamburger.addEventListener("click", () => {
        menu.classList.toggle("active");
      });

      document.querySelectorAll(".menu a").forEach(link => {
        link.addEventListener("click", () => {
          menu.classList.remove("active");
        });
      });

      let lastScrollTop = 0;
      const navbar = document.getElementById("navbar");

      window.addEventListener("scroll", () => {
        let scrollTop = window.pageYOffset || document.documentElement.scrollTop;

        if (scrollTop > lastScrollTop) {
          navbar.classList.add("hide");
          navbar.classList.remove("show");
        } else {
          navbar.classList.add("show");
          navbar.classList.remove("hide");
        }

        lastScrollTop = scrollTop <= 0 ? 0 : scrollTop;
      });


document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener("click", function (e) {
    e.preventDefault();

    const targetId = this.getAttribute("href");
    const targetElement = document.querySelector(targetId);

    if (targetElement) {
      const navbarHeight = navbar.offsetHeight;
      const elementPosition = targetElement.offsetTop - navbarHeight;

      window.scrollTo({
        top: elementPosition,
        behavior: "smooth"
      });
    }

    // Fecha menu mobile ao clicar
    menu.classList.remove("active");
  });
});