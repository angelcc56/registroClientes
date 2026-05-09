(function () {
  "use strict";

  const API_URL = "https://demoparcialprog3.azurewebsites.net/api/Pacientes";
  const THEME_STORAGE_KEY = "registroPacientes-theme";

  const MEDICOS_AUTORIZADOS = [
    "MED-1010",
    "MED-2020",
    "MED-3030",
    "MED-4040",
    "MED-5050",
  ];

  const ESTADOS_VALIDOS = ["En espera", "Atendido", "Derivado"];
  const PACIENTES_POR_PAGINA = 10;
  const PATRON_NOMBRE = /^[\p{L}\s'.-]+$/u;

  const ICON_ALERTA_OK =
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ICON_ALERTA_ERR =
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 8v5M12 16h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  let todosLosPacientes = [];
  let paginaActual = 1;
  let toastExitoTimer = null;

  const el = {
    cuerpoTabla: document.getElementById("cuerpoTabla"),
    contenedorTabla: document.getElementById("contenedorTabla"),
    estadoCarga: document.getElementById("estadoCarga"),
    alertaError: document.getElementById("alertaError"),
    mensajeError: document.getElementById("mensajeError"),
    contadorPacientes: document.getElementById("contadorPacientes"),
    btnRefrescar: document.getElementById("btnRefrescar"),
    btnTema: document.getElementById("btnTema"),
    iconTemaLuna: document.querySelector(".btn-theme__icon--moon"),
    iconTemaSol: document.querySelector(".btn-theme__icon--sun"),
    textTema: document.querySelector(".btn-theme__text"),
    formAlta: document.getElementById("formAltaPaciente"),
    alertaAlta: document.getElementById("alertaAlta"),
    alertaAltaTitulo: document.getElementById("alertaAltaTitulo"),
    alertaAltaDetalle: document.getElementById("alertaAltaDetalle"),
    alertaAltaIcon: document.getElementById("alertaAltaIcon"),
    toastExito: document.getElementById("toastExito"),
    toastExitoTexto: document.querySelector("#toastExito .toast-exito__texto"),
    altaNombre: document.getElementById("altaNombre"),
    altaGravedad: document.getElementById("altaGravedad"),
    altaEstado: document.getElementById("altaEstado"),
    altaCarnet: document.getElementById("altaCarnet"),
    btnGuardarPaciente: document.getElementById("btnGuardarPaciente"),
    btnLimpiarForm: document.getElementById("btnLimpiarForm"),
    btnPagAnterior: document.getElementById("btnPagAnterior"),
    btnPagSiguiente: document.getElementById("btnPagSiguiente"),
    paginacionRango: document.getElementById("paginacionRango"),
    paginacionPaginas: document.getElementById("paginacionPaginas"),
  };

  function getTheme() {
    return document.documentElement.getAttribute("data-theme") === "dark"
      ? "dark"
      : "light";
  }

  function setTheme(theme) {
    const next = theme === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch (_) {}
    syncThemeButton();
  }

  function syncThemeButton() {
    const dark = getTheme() === "dark";
    el.btnTema.setAttribute("aria-pressed", dark ? "true" : "false");
    el.btnTema.setAttribute(
      "aria-label",
      dark ? "Activar modo claro" : "Activar modo oscuro"
    );
    el.textTema.textContent = dark ? "Claro" : "Oscuro";
    el.iconTemaLuna.hidden = dark;
    el.iconTemaSol.hidden = !dark;
  }

  /**
   * Normaliza objetos de la API al contrato esperado (idPaciente, nombreCompleto, nivelGravedad, estado).
   * Compatible con variantes como codigoPaciente / nombre / gravedad.
   */
  function normalizarPaciente(raw) {
    if (!raw || typeof raw !== "object") return null;
    const id =
      raw.idPaciente ?? raw.codigoPaciente ?? raw.codigo_paciente ?? raw.id ?? "";
    const nombre =
      raw.nombreCompleto ?? raw.nombre ?? raw.nombreCompletoPaciente ?? "";
    const gravedad = Number(
      raw.nivelGravedad ?? raw.gravedad ?? raw.nivel ?? NaN
    );
    const estado = raw.estado != null ? String(raw.estado) : "";
    const carnetMedico =
      raw.carnetMedico ?? raw.carnet_medico ?? raw.CarnetMedico ?? "";
    const fechaRaw =
      raw.fechaIngreso ?? raw.fecha_ingreso ?? raw.FechaIngreso ?? null;
    let fechaIngreso = null;
    if (fechaRaw != null && fechaRaw !== "") {
      const d = new Date(fechaRaw);
      fechaIngreso = Number.isNaN(d.getTime()) ? null : d;
    }
    if (!id && !nombre) return null;
    return {
      idPaciente: String(id),
      nombreCompleto: String(nombre),
      nivelGravedad: Number.isFinite(gravedad) ? gravedad : 0,
      estado,
      carnetMedico: carnetMedico ? String(carnetMedico) : "—",
      fechaIngreso,
    };
  }

  function formatoFechaHora(fecha) {
    if (!fecha || !(fecha instanceof Date)) return "—";
    return fecha.toLocaleString("es-GT", {
      dateStyle: "short",
      timeStyle: "short",
    });
  }

  function animarEntradaAlerta(nodo) {
    if (!nodo) return;
    nodo.classList.remove("alert-animate-in");
    void nodo.offsetWidth;
    nodo.classList.add("alert-animate-in");
  }

  function ocultarAlertaAlta() {
    el.alertaAlta.classList.remove("alert-animate-in");
    el.alertaAlta.classList.add("d-none");
    el.alertaAltaTitulo.textContent = "";
    el.alertaAltaDetalle.innerHTML = "";
    el.alertaAltaIcon.innerHTML = "";
    el.alertaAlta.classList.remove("alert-app-success", "alert-app-danger");
  }

  /**
   * @param {"success"|"error"} tipo
   * @param {string} titulo
   * @param {string|string[]} cuerpo  Una o varias líneas de detalle
   */
  function mostrarAlertaAlta(tipo, titulo, cuerpo) {
    const lineas = Array.isArray(cuerpo)
      ? cuerpo.filter(function (s) {
          return s != null && String(s).trim() !== "";
        })
      : cuerpo != null && String(cuerpo).trim() !== ""
        ? [String(cuerpo)]
        : [];

    el.alertaAltaTitulo.textContent = titulo || (tipo === "success" ? "Correcto" : "Atención");
    el.alertaAltaDetalle.innerHTML = "";
    lineas.forEach(function (linea) {
      const p = document.createElement("p");
      p.className = "mb-1";
      p.textContent = linea;
      el.alertaAltaDetalle.appendChild(p);
    });

    el.alertaAltaIcon.innerHTML =
      tipo === "success" ? ICON_ALERTA_OK : ICON_ALERTA_ERR;

    el.alertaAlta.classList.remove("alert-app-success", "alert-app-danger", "d-none");
    el.alertaAlta.classList.add(
      tipo === "success" ? "alert-app-success" : "alert-app-danger"
    );
    requestAnimationFrame(function () {
      animarEntradaAlerta(el.alertaAlta);
      try {
        el.alertaAlta.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } catch (_) {}
    });
  }

  function mostrarToastExito(texto) {
    if (!el.toastExito || !el.toastExitoTexto) return;
    el.toastExitoTexto.textContent = texto;
    el.toastExito.classList.remove("d-none");
    if (toastExitoTimer) {
      clearTimeout(toastExitoTimer);
    }
    toastExitoTimer = setTimeout(function () {
      el.toastExito.classList.add("d-none");
      toastExitoTimer = null;
    }, 6500);
  }

  async function leerMensajeErrorApi(respuesta) {
    const texto = await respuesta.text();
    if (!texto) {
      return `Error ${respuesta.status} ${respuesta.statusText || ""}`.trim();
    }
    try {
      const json = JSON.parse(texto);
      if (json && typeof json === "object") {
        if (typeof json.mensaje === "string") return json.mensaje;
        if (typeof json.title === "string") return json.title;
        if (json.errors && typeof json.errors === "object") {
          const partes = [];
          Object.keys(json.errors).forEach(function (k) {
            const v = json.errors[k];
            if (Array.isArray(v)) partes.push(v.join(" "));
            else if (v) partes.push(String(v));
          });
          if (partes.length) return partes.join(" ");
        }
      }
    } catch (_) {
      return texto;
    }
    return texto;
  }

  function mostrarCarga(visible) {
    el.estadoCarga.classList.toggle("d-none", !visible);
  }

  function mostrarError(mensaje, detalleTecnico) {
    el.alertaError.classList.remove("d-none");
    const extra =
      detalleTecnico && detalleTecnico !== mensaje
        ? `\n\nDetalle del navegador: ${detalleTecnico}`
        : "";
    el.mensajeError.textContent = mensaje + extra;
    el.contenedorTabla.classList.add("d-none");
    requestAnimationFrame(function () {
      animarEntradaAlerta(el.alertaError);
    });
  }

  function ocultarError() {
    el.alertaError.classList.remove("alert-animate-in");
    el.alertaError.classList.add("d-none");
    el.mensajeError.textContent = "";
  }

  function badgeGravedad(n) {
    const nivel = Number(n);
    const cls =
      nivel >= 5
        ? "danger"
        : nivel >= 4
          ? "warning text-dark"
          : nivel >= 2
            ? "info text-dark"
            : "secondary";
    return `<span class="badge rounded-pill text-bg-${cls} badge-gravedad">${nivel}</span>`;
  }

  function renderizarFilas(pacientes) {
    el.cuerpoTabla.innerHTML = "";
    pacientes.forEach((p) => {
      const tr = document.createElement("tr");
      if (p.nivelGravedad === 5) {
        tr.classList.add("fila-critica");
        tr.setAttribute("title", "Paciente con gravedad máxima (5)");
      }
      tr.innerHTML = `
        <td class="ps-4 font-monospace small">${escapeHtml(p.idPaciente)}</td>
        <td>${escapeHtml(p.nombreCompleto)}</td>
        <td class="text-center">${badgeGravedad(p.nivelGravedad)}</td>
        <td>${escapeHtml(p.estado)}</td>
        <td class="font-monospace small">${escapeHtml(p.carnetMedico)}</td>
        <td class="pe-4 text-nowrap small">${escapeHtml(formatoFechaHora(p.fechaIngreso))}</td>
      `;
      el.cuerpoTabla.appendChild(tr);
    });
  }

  function totalPaginasTabla() {
    const n = todosLosPacientes.length;
    return n === 0 ? 1 : Math.ceil(n / PACIENTES_POR_PAGINA);
  }

  function renderVistaTablaPaginada() {
    const total = todosLosPacientes.length;
    const totalPag = totalPaginasTabla();
    if (paginaActual > totalPag) {
      paginaActual = totalPag;
    }
    if (paginaActual < 1) {
      paginaActual = 1;
    }
    const inicioIdx = (paginaActual - 1) * PACIENTES_POR_PAGINA;
    const slice = todosLosPacientes.slice(
      inicioIdx,
      inicioIdx + PACIENTES_POR_PAGINA
    );

    renderizarFilas(slice);

    el.contadorPacientes.textContent =
      total + " paciente" + (total !== 1 ? "s" : "");

    if (total === 0) {
      el.paginacionRango.textContent =
        "No hay pacientes. Registre uno o actualice la lista.";
    } else {
      el.paginacionRango.textContent =
        "Mostrando " +
        (inicioIdx + 1) +
        "–" +
        (inicioIdx + slice.length) +
        " de " +
        total;
    }
    el.paginacionPaginas.textContent =
      "Página " + paginaActual + " de " + totalPag;

    el.btnPagAnterior.disabled = paginaActual <= 1;
    el.btnPagSiguiente.disabled = paginaActual >= totalPag;
  }

  function irPaginaAnterior() {
    if (paginaActual > 1) {
      paginaActual -= 1;
      renderVistaTablaPaginada();
    }
  }

  function irPaginaSiguiente() {
    if (paginaActual < totalPaginasTabla()) {
      paginaActual += 1;
      renderVistaTablaPaginada();
    }
  }

  function sincronizarValidezNombre() {
    const input = el.altaNombre;
    const fb = document.getElementById("feedbackNombre");
    const v = input.value.trim();
    if (input.value.length > 0 && v.length === 0) {
      input.setCustomValidity("El nombre no puede ser solo espacios.");
      if (fb) {
        fb.textContent =
          "Escriba al menos 2 letras; no use solo espacios en blanco.";
      }
      return;
    }
    if (v.length > 0 && v.length < 2) {
      input.setCustomValidity("Mínimo 2 caracteres.");
      if (fb) {
        fb.textContent = "El nombre debe tener al menos 2 caracteres.";
      }
      return;
    }
    if (v.length > 200) {
      input.setCustomValidity("Máximo 200 caracteres.");
      if (fb) {
        fb.textContent = "Reduzca el nombre a 200 caracteres como máximo.";
      }
      return;
    }
    if (v.length >= 2 && !PATRON_NOMBRE.test(v)) {
      input.setCustomValidity("Caracteres no permitidos.");
      if (fb) {
        fb.textContent =
          "Use solo letras (incl. ñ y tildes), espacios, apóstrofo o guion.";
      }
      return;
    }
    input.setCustomValidity("");
    if (fb) {
      fb.textContent = "Revise el nombre según las reglas indicadas.";
    }
  }

  function sincronizarValidezGravedad() {
    const s = el.altaGravedad;
    const fb = document.getElementById("feedbackGravedad");
    if (s.value === "") {
      s.setCustomValidity("");
      if (fb) {
        fb.textContent =
          "Debe elegir un nivel del 1 (estable) al 5 (crítico).";
      }
      return;
    }
    if (!/^[1-5]$/.test(s.value)) {
      s.setCustomValidity("Nivel fuera de rango.");
      if (fb) {
        fb.textContent = "Seleccione un valor válido entre 1 y 5.";
      }
      return;
    }
    s.setCustomValidity("");
    if (fb) {
      fb.textContent =
        "Debe elegir un nivel del 1 (estable) al 5 (crítico).";
    }
  }

  function sincronizarValidezEstado() {
    const s = el.altaEstado;
    const fb = document.getElementById("feedbackEstado");
    if (s.value === "") {
      s.setCustomValidity("");
      if (fb) {
        fb.textContent =
          "Elija uno de los estados válidos: En espera, Atendido o Derivado.";
      }
      return;
    }
    if (!ESTADOS_VALIDOS.includes(s.value)) {
      s.setCustomValidity("Estado no permitido.");
      if (fb) {
        fb.textContent =
          "Elija exactamente: En espera, Atendido o Derivado.";
      }
      return;
    }
    s.setCustomValidity("");
    if (fb) {
      fb.textContent =
        "Elija uno de los estados válidos: En espera, Atendido o Derivado.";
    }
  }

  function sincronizarValidezCarnet() {
    const s = el.altaCarnet;
    const fb = document.getElementById("feedbackCarnet");
    if (s.value === "") {
      s.setCustomValidity("");
      if (fb) {
        fb.textContent = "Seleccione un médico de la lista autorizada.";
      }
      return;
    }
    if (!MEDICOS_AUTORIZADOS.includes(s.value)) {
      s.setCustomValidity("Carnet no autorizado.");
      if (fb) {
        fb.textContent =
          "Elija un carnet MED-1010, MED-2020, MED-3030, MED-4040 o MED-5050.";
      }
      return;
    }
    s.setCustomValidity("");
    if (fb) {
      fb.textContent = "Seleccione un médico de la lista autorizada.";
    }
  }

  function sincronizarTodoFormularioAlta() {
    sincronizarValidezNombre();
    sincronizarValidezGravedad();
    sincronizarValidezEstado();
    sincronizarValidezCarnet();
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  async function cargarPacientes() {
    ocultarError();
    mostrarCarga(true);
    el.btnRefrescar.disabled = true;
    el.contenedorTabla.classList.add("d-none");

    try {
      const respuesta = await fetch(API_URL, {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      if (!respuesta.ok) {
        throw new Error(
          `El servidor respondió ${respuesta.status} ${respuesta.statusText || ""}`.trim()
        );
      }

      const texto = await respuesta.text();
      let datos;
      try {
        datos = texto ? JSON.parse(texto) : [];
      } catch {
        throw new Error("La respuesta no es JSON válido.");
      }

      if (!Array.isArray(datos)) {
        throw new Error("Se esperaba un arreglo de pacientes en la respuesta.");
      }

      const pacientes = datos
        .map(normalizarPaciente)
        .filter(Boolean)
        .sort(function (a, b) {
          if (b.nivelGravedad !== a.nivelGravedad) {
            return b.nivelGravedad - a.nivelGravedad;
          }
          const fa = a.fechaIngreso instanceof Date ? a.fechaIngreso.getTime() : 0;
          const fb = b.fechaIngreso instanceof Date ? b.fechaIngreso.getTime() : 0;
          return fa - fb;
        });

      todosLosPacientes = pacientes;
      paginaActual = 1;
      mostrarCarga(false);
      renderVistaTablaPaginada();
      el.contenedorTabla.classList.remove("d-none");
    } catch (err) {
      mostrarCarga(false);
      const detalle = err instanceof Error ? err.message : String(err);
      const esRedOCors =
        err instanceof TypeError &&
        (detalle === "Failed to fetch" ||
          detalle.includes("fetch") ||
          detalle.includes("Load failed") ||
          detalle.includes("NetworkError"));
      const msg = esRedOCors
        ? "No se pudo completar la petición (red, CORS o página abierta como archivo local). Compruebe: 1) que la API tenga app.UseCors() en Program.cs antes de MapControllers, 2) que abra el HTML con un servidor local (Live Server) y no solo como archivo, 3) la pestaña Red (F12) del navegador."
        : err instanceof Error
          ? err.message
          : "Error desconocido al obtener los datos.";
      mostrarError(msg, detalle);
    } finally {
      el.btnRefrescar.disabled = false;
    }
  }

  function validarPayloadAlta(body) {
    const nombre = String(body.nombre || "").trim();
    if (!nombre) {
      return "El nombre del paciente es obligatorio.";
    }
    if (nombre.length < 2 || nombre.length > 200) {
      return "El nombre debe tener entre 2 y 200 caracteres.";
    }
    if (!PATRON_NOMBRE.test(nombre)) {
      return "El nombre contiene caracteres no permitidos.";
    }
    const g = Number(body.gravedad);
    if (!Number.isInteger(g) || g < 1 || g > 5) {
      return "La gravedad debe ser un entero entre 1 y 5.";
    }
    if (!ESTADOS_VALIDOS.includes(body.estado)) {
      return "Estado no válido. Use: En espera, Atendido o Derivado.";
    }
    if (!body.carnetMedico || !MEDICOS_AUTORIZADOS.includes(body.carnetMedico)) {
      return "Carnet médico no autorizado.";
    }
    return null;
  }

  async function crearPaciente() {
    const body = {
      nombre: el.altaNombre.value.trim(),
      gravedad: Number.parseInt(el.altaGravedad.value, 10),
      estado: el.altaEstado.value,
      carnetMedico: el.altaCarnet.value,
    };
    const errLocal = validarPayloadAlta(body);
    if (errLocal) {
      mostrarAlertaAlta("error", "Revise los datos del formulario", errLocal);
      return;
    }

    ocultarAlertaAlta();
    el.btnGuardarPaciente.disabled = true;
    el.btnGuardarPaciente.textContent = "Guardando…";

    try {
      const respuesta = await fetch(API_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (respuesta.status === 201) {
        const texto = await respuesta.text();
        let codigo = "";
        try {
          const creado = texto ? JSON.parse(texto) : null;
          if (creado && typeof creado === "object") {
            codigo =
              creado.codigoPaciente ||
              creado.codigo_paciente ||
              creado.CodigoPaciente ||
              "";
          }
        } catch (_) {}
        const lineasExito = [
          "El paciente se guardó correctamente en la base del hospital.",
          "Nombre: " + body.nombre,
        ];
        if (codigo) {
          lineasExito.push("Código asignado por el sistema: " + codigo);
        }
        lineasExito.push(
          "Gravedad " +
            body.gravedad +
            " · Estado: " +
            body.estado +
            " · Médico responsable: " +
            body.carnetMedico
        );
        lineasExito.push(
          "La tabla de pacientes se actualizó automáticamente."
        );

        mostrarAlertaAlta("success", "¡Paciente creado con éxito!", lineasExito);

        const textoToast = codigo
          ? "Paciente registrado: " + body.nombre + " (" + codigo + ")."
          : "Paciente " + body.nombre + " registrado correctamente.";
        mostrarToastExito(textoToast);

        el.formAlta.reset();
        el.formAlta.classList.remove("was-validated");
        await cargarPacientes();
        return;
      }

      const mensaje = await leerMensajeErrorApi(respuesta);
      mostrarAlertaAlta(
        "error",
        "No se pudo registrar el paciente",
        mensaje
      );
    } catch (err) {
      const detalle = err instanceof Error ? err.message : String(err);
      const esRed =
        err instanceof TypeError &&
        (detalle === "Failed to fetch" ||
          detalle.includes("fetch") ||
          detalle.includes("NetworkError"));
      mostrarAlertaAlta(
        "error",
        esRed ? "Error de conexión" : "Error inesperado",
        esRed
          ? "No se pudo contactar la API (red o CORS). Revise la consola o la pestaña Red."
          : detalle
      );
    } finally {
      el.btnGuardarPaciente.disabled = false;
      el.btnGuardarPaciente.textContent = "Guardar paciente";
    }
  }

  el.btnRefrescar.addEventListener("click", cargarPacientes);
  el.btnTema.addEventListener("click", function () {
    setTheme(getTheme() === "dark" ? "light" : "dark");
  });

  el.formAlta.addEventListener("submit", function (e) {
    e.preventDefault();
    sincronizarTodoFormularioAlta();
    if (!el.formAlta.checkValidity()) {
      el.formAlta.classList.add("was-validated");
      return;
    }
    crearPaciente();
  });

  el.formAlta.addEventListener("reset", function () {
    requestAnimationFrame(function () {
      el.formAlta.classList.remove("was-validated");
      ocultarAlertaAlta();
      sincronizarTodoFormularioAlta();
    });
  });

  el.altaNombre.addEventListener("input", sincronizarValidezNombre);
  el.altaNombre.addEventListener("blur", function () {
    el.altaNombre.value = el.altaNombre.value.trim();
    sincronizarValidezNombre();
  });
  el.altaGravedad.addEventListener("change", sincronizarValidezGravedad);
  el.altaEstado.addEventListener("change", sincronizarValidezEstado);
  el.altaCarnet.addEventListener("change", sincronizarValidezCarnet);

  el.btnPagAnterior.addEventListener("click", irPaginaAnterior);
  el.btnPagSiguiente.addEventListener("click", irPaginaSiguiente);

  document.addEventListener("DOMContentLoaded", function () {
    syncThemeButton();
    sincronizarTodoFormularioAlta();
    cargarPacientes();
  });
})();
