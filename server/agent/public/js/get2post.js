/*

*** Usage ***
link / button must contain class 'get2post'
link / button must contain data-query (e.g - 'a=1&b=2')

you may add data-confirm to confirm before post (e.g - data-confirm="Are you sure!")

*/

const g2p_elements = document.querySelectorAll(".get2post");

for (const element of g2p_elements) {
  element.addEventListener("click", () => {
    if (element.dataset.confirm) {
      if (!confirm(element.dataset.confirm)) return;
    }

    const query = element.dataset.query;
    const searchParams = new URLSearchParams(query);
    const params = Object.fromEntries(searchParams);

    const form = document.createElement("form");
    form.method = "post";
    form.action = "";

    for (const key in params) {
      if (params.hasOwnProperty(key)) {
        const hiddenField = document.createElement("input");
        hiddenField.type = "hidden";
        hiddenField.name = key;
        hiddenField.value = params[key];

        form.appendChild(hiddenField);
      }
    }

    document.body.appendChild(form);
    form.submit();
  });
}
