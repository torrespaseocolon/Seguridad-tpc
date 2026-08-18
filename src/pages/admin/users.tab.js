import { el, clear, toast, openModal, loadingState, confirmDialog } from "../../utils/dom.js";
import { icon } from "../../utils/icons.js";
import { fetchUsers, updateUser, deleteUser } from "../../services/users.service.js";
import { createStaffAccount, getProfile } from "../../services/auth.service.js";
import { friendlyError } from "../../utils/errors.js";

export async function renderUsersTab(root) {
  clear(root);
  root.appendChild(el("button", { class: "btn btn--primary btn--block mb-md", onclick: () => openCreateModal(load) }, [icon("plus", { size: 18 }), " CREAR USUARIO"]));
  const list = el("div", { class: "stack" });
  root.appendChild(list);

  async function load() {
    clear(list);
    list.appendChild(loadingState());
    try {
      const users = await fetchUsers();
      clear(list);
      for (const u of users) list.appendChild(renderUserCard(u, load));
    } catch (err) {
      clear(list);
      list.appendChild(el("div", { class: "empty-state" }, friendlyError(err)));
    }
  }

  await load();
}

function renderUserCard(user, reload) {
  const roleSelect = el("select", { class: "form-control" }, [
    el("option", { value: "guard", selected: user.role === "guard" }, "Guardia"),
    el("option", { value: "admin", selected: user.role === "admin" }, "Administrador"),
    el("option", { value: "viewer", selected: user.role === "viewer" }, "Solo lectura (Panel y Reportes)"),
  ]);
  const lobbySelect = el("select", { class: "form-control" }, [
    el("option", { value: "", selected: !user.lobby }, "Sin lobby asignado"),
    el("option", { value: "A", selected: user.lobby === "A" }, "Lobby A"),
    el("option", { value: "B", selected: user.lobby === "B" }, "Lobby B"),
  ]);
  const saveBtn = el("button", { class: "btn btn--primary" }, "Guardar cambios");
  const toggleBtn = el(
    "button",
    { class: `btn ${user.active ? "btn--danger" : "btn--success"}` },
    user.active ? "Desactivar" : "Activar"
  );

  saveBtn.addEventListener("click", async () => {
    const isSelf = user.uid === getProfile().uid;
    if (isSelf && roleSelect.value !== "admin") {
      toast("No puede quitarse a sí mismo el rol de administrador desde aquí.", "danger");
      return;
    }
    saveBtn.disabled = true;
    try {
      await updateUser(user.uid, { role: roleSelect.value, lobby: lobbySelect.value || null });
      toast("Usuario actualizado.", "success");
      reload();
    } catch (err) {
      toast(friendlyError(err), "danger");
      saveBtn.disabled = false;
    }
  });

  toggleBtn.addEventListener("click", async () => {
    if (user.uid === getProfile().uid) {
      toast("No puede desactivar su propia cuenta.", "danger");
      return;
    }
    const ok = await confirmDialog({
      title: user.active ? "Desactivar usuario" : "Activar usuario",
      body: `¿Confirma ${user.active ? "desactivar" : "activar"} a ${user.name}? ${user.active ? "No podrá iniciar sesión mientras esté desactivado." : ""}`,
      danger: user.active,
    });
    if (!ok) return;
    try {
      await updateUser(user.uid, { active: !user.active });
      toast("Estado actualizado.", "success");
      reload();
    } catch (err) {
      toast(friendlyError(err), "danger");
    }
  });

  const deleteBtn = el("button", { class: "btn btn--danger" }, [icon("close", { size: 16 }), " Eliminar"]);
  deleteBtn.addEventListener("click", async () => {
    if (user.uid === getProfile().uid) {
      toast("No puede eliminar su propia cuenta.", "danger");
      return;
    }
    const ok = await confirmDialog({
      title: "Eliminar usuario",
      body: `¿Confirma eliminar a ${user.name} (${user.email})? No podrá volver a iniciar sesión y desaparece de esta lista. Esta acción no se puede deshacer desde la app.`,
      confirmText: "Sí, eliminar",
      danger: true,
    });
    if (!ok) return;
    deleteBtn.disabled = true;
    try {
      await deleteUser(user.uid, user.name);
      toast("Usuario eliminado.", "success");
      reload();
    } catch (err) {
      toast(friendlyError(err), "danger");
      deleteBtn.disabled = false;
    }
  });

  return el("div", { class: "card" }, [
    el("div", { class: "row row--between" }, [
      el("strong", {}, user.name),
      el("span", { class: `badge ${user.active ? "badge--free" : "badge--disabled"}` }, user.active ? "ACTIVO" : "INACTIVO"),
    ]),
    el("div", { class: "text-secondary" }, user.email),
    el("div", { class: "row mt-md" }, [
      el("div", { class: "form-group grow" }, [el("label", { class: "form-label" }, "Rol"), roleSelect]),
      el("div", { class: "form-group grow" }, [el("label", { class: "form-label" }, "Lobby"), lobbySelect]),
    ]),
    el("div", { class: "row", style: "flex-wrap:wrap;" }, [saveBtn, toggleBtn, deleteBtn]),
  ]);
}

function openCreateModal(reload) {
  const nameInput = el("input", { class: "form-control", required: true });
  const emailInput = el("input", { class: "form-control", type: "email", required: true });
  const passInput = el("input", { class: "form-control", type: "text", required: true, placeholder: "Mínimo 6 caracteres" });
  const roleSelect = el("select", { class: "form-control" }, [
    el("option", { value: "guard" }, "Guardia"),
    el("option", { value: "admin" }, "Administrador"),
    el("option", { value: "viewer" }, "Solo lectura (Panel y Reportes)"),
  ]);
  const lobbySelect = el("select", { class: "form-control" }, [
    el("option", { value: "" }, "Sin lobby asignado"),
    el("option", { value: "A" }, "Lobby A"),
    el("option", { value: "B" }, "Lobby B"),
  ]);
  const errorBox = el("div", { class: "form-error", style: "display:none;" });
  const submitBtn = el("button", { class: "btn btn--primary btn--block btn--lg", type: "submit" }, "CREAR USUARIO");

  const form = el(
    "form",
    {
      class: "stack",
      onsubmit: async (e) => {
        e.preventDefault();
        submitBtn.disabled = true;
        submitBtn.textContent = "CREANDO...";
        const result = await createStaffAccount({
          name: nameInput.value.trim(),
          email: emailInput.value.trim(),
          tempPassword: passInput.value,
          role: roleSelect.value,
          lobby: lobbySelect.value || null,
        });
        if (result.ok) {
          toast("Usuario creado. Entréguele el correo y la contraseña temporal.", "success");
          closeFn();
          reload();
        } else {
          errorBox.textContent = result.message;
          errorBox.style.display = "block";
          submitBtn.disabled = false;
          submitBtn.textContent = "CREAR USUARIO";
        }
      },
    },
    [
      el("div", { class: "modal__title" }, "Crear usuario"),
      el("div", { class: "form-hint mb-md" }, "Cree una contraseña temporal y entréguesela a la persona en privado. Puede pedirle que la cambie luego con \"¿Olvidó su contraseña?\" en la pantalla de inicio de sesión."),
      field("Nombre completo", nameInput),
      field("Correo", emailInput),
      field("Contraseña temporal", passInput),
      field("Rol", roleSelect),
      field("Lobby", lobbySelect),
      errorBox,
      submitBtn,
    ]
  );

  const closeFn = openModal(form);
  nameInput.focus();
}

function field(labelText, inputNode) {
  return el("div", { class: "form-group" }, [el("label", { class: "form-label" }, labelText), inputNode]);
}
