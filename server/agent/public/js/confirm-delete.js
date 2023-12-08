const btnDels = document.querySelectorAll(".btn-delete");

for (const btnDel of btnDels) {
  btnDel.addEventListener("click", () => {
    let data = btnDel.dataset.link;
    if (btnDel.dataset.msg) {
      if (confirm(btnDel.dataset.msg)) {
        window.location = data;
      }
    } else {
      if (confirm("Are you sure want to delete?")) {
        window.location = data;
      }
    }
  });
}
