import { el, clear, toast } from "../utils/dom.js";
import { login } from "../services/auth.service.js";

export function renderLogin(root) {
  clear(root);

  const emailInput = el("input", {
    class: "form-control",
    type: "email",
    id: "login-email",
    autocomplete: "username",
    placeholder: "correo@ejemplo.com",
  });
  const passwordInput = el("input", {
    class: "form-control",
    type: "password",
    id: "login-password",
    autocomplete: "current-password",
    placeholder: "••••••••",
  });
  const errorBox = el("div", { class: "form-error", style: "display:none;" });
  const submitBtn = el("button", { class: "btn btn--primary btn--block btn--lg", type: "submit" }, "INICIAR SESIÓN");

  const form = el(
    "form",
    {
      class: "stack",
      onsubmit: async (e) => {
        e.preventDefault();
        errorBox.style.display = "none";
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        if (!email || !password) {
          errorBox.textContent = "Ingrese correo y contraseña.";
          errorBox.style.display = "block";
          return;
        }
        submitBtn.disabled = true;
        submitBtn.textContent = "INGRESANDO...";
        const result = await login(email, password);
        if (!result.ok) {
          errorBox.textContent = result.message;
          errorBox.style.display = "block";
          submitBtn.disabled = false;
          submitBtn.textContent = "INICIAR SESIÓN";
        }
        // Si fue exitoso, app.js detecta el cambio de sesión y cambia de pantalla.
      },
    },
    [
      el("div", { class: "form-group" }, [el("label", { class: "form-label", for: "login-email" }, "Correo"), emailInput]),
      el("div", { class: "form-group" }, [
        el("label", { class: "form-label", for: "login-password" }, "Contraseña"),
        passwordInput,
      ]),
      errorBox,
      submitBtn,
    ]
  );

  const logoImg = el("img", {
    src: "./icons/logo.png",
    alt: "Logo Torres Paseo Colón",
    style: "width:100%; height:100%; object-fit:contain; border-radius:inherit;",
    onerror: (e) => e.target.replaceWith(document.createTextNode("LOGO TPC")),
  });

  const screen = el("div", { class: "login-screen" }, [
    el("div", { class: "login-card" }, [
      el("div", { class: "login-logo", id: "login-logo-slot" }, [logoImg]),
      el("div", { class: "login-title" }, [
        el("h1", {}, "TORRES PASEO COLÓN"),
        el("p", {}, "Sistema de Seguridad — Lobby A / Lobby B"),
      ]),
      el("div", { class: "card" }, [form]),
    ]),
  ]);

  root.appendChild(screen);
  emailInput.focus();
}
