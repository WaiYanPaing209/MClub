function superPrompt(options, callback) {
  const backdrop = document.createElement("div");
  backdrop.classList.add("position-fixed", "top-0", "start-0", "vw-100", "vh-100");
  backdrop.style.backgroundColor = "rgba(0,0,0,0.7)";
  backdrop.style.zIndex = 1000;
  backdrop.addEventListener("click", () => {
    body.remove();
    backdrop.remove();
  });

  const body = document.createElement("div");
  body.classList.add("position-fixed", "top-0", "start-50", "translate-middle-x", "p-3", "border", "rounded");
  body.style.marginTop = "50px";
  body.style.zIndex = 1100;
  if (options.width) {
    body.style.width = options.width;
  } else {
    body.style.width = "400px";
  }

  if (options.backgroundColor) {
    body.style.backgroundColor = options.backgroundColor;
  } else {
    body.style.backgroundColor = "white";
  }

  if (options.title) {
    body.innerHTML = `<h3>${options.title}</h3><hr class="mb-2">`;
  }

  if (options.fields) {
    options.fields.forEach((field) => {
      let div = document.createElement("div");

      // Create Label
      if (field.label) {
        div.textContent = field.label;
      }

      // Create Input Field
      if (field.type) {
        if (field.type == "select") {
          const select = document.createElement("select");
          select.name = field.name;
          select.classList.add("form-select", "mb-1");
          field.options.forEach((item) => {
            let option = document.createElement("option");
            if (typeof item == "object") {
              // option is object
              option.textContent = item.label;
              option.value = item.value;
            } else {
              // option is array
              option.textContent = item;
            }
            select.appendChild(option);
          });
          div.appendChild(select);
        } else if (field.type == "textarea") {
          const input = document.createElement("textarea");
          input.name = field.name;
          input.classList.add("form-control", "mb-1");
          if (field.placeHolder) input.placeholder = field.placeHolder;
          div.appendChild(input);
        } else {
          const input = document.createElement("input");
          input.type = field.type;
          input.name = field.name;
          input.classList.add("form-control", "mb-1");
          if (field.placeHolder) input.placeholder = field.placeHolder;
          div.appendChild(input);
        }
      }
      body.appendChild(div);
    });
  }

  const btns = document.createElement("div");
  btns.classList.add("d-flex", "justify-content-end");

  const btnClear = document.createElement("a");
  btnClear.textContent = "Clear";
  btnClear.classList.add("btn", "btn-outline-secondary", "me-1");
  btnClear.addEventListener("click", () => {
    options.fields.forEach((field) => {
      body.querySelector(`input[name="${field.name}"]`).value = "";
    });
  });

  const btnSave = document.createElement("a");
  btnSave.textContent = "Save";
  btnSave.classList.add("btn", "btn-outline-secondary", "me-1");
  btnSave.addEventListener("click", () => {
    let result = {};
    options.fields.forEach((field) => {
      if (field.type == "select") {
        result[field.name] = body.querySelector(`select[name="${field.name}"]`).value;
      } else if (field.type == "textarea") {
        result[field.name] = body.querySelector(`textarea[name="${field.name}"]`).value;
      } else {
        result[field.name] = body.querySelector(`input[name="${field.name}"]`).value;
      }
    });

    body.remove();
    backdrop.remove();
    callback(result);
  });

  const btnClose = document.createElement("a");
  btnClose.textContent = "Close";
  btnClose.classList.add("btn", "btn-outline-secondary");
  btnClose.addEventListener("click", () => {
    body.remove();
    backdrop.remove();
  });

  btns.append(btnClear, btnSave, btnClose);

  body.innerHTML += `<hr class="mb-3">`;
  body.appendChild(btns);

  // backdrop.appendChild(body);
  document.body.appendChild(body);
  document.body.appendChild(backdrop);

  options.fields.forEach((field) => {
    if (field.value) {
      if (field.type == "textarea") {
        body.querySelector(`textarea[name="${field.name}"]`).textContent = field.value;
      } else {
        body.querySelector(`input[name="${field.name}"]`).value = field.value;
      }
    }
  });
}
