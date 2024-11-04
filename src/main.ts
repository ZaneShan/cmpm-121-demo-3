// todo

import "./style.css";

const title = document.createElement("h1");
title.textContent = "Geocoin Carrier";
document.body.append(title);

// button
const button = document.createElement("button");
button.textContent = "button";
document.body.append(button);
// button functionality
button.addEventListener("click", () => {
  alert("you clicked the button!");
});
