import { test } from "node:test";
import assert from "node:assert/strict";
import { translateText } from "../src/locales.js";

test("the supported interface languages translate common labels", () => {
  assert.equal(translateText("Language", "fr"), "Langue");
  assert.equal(translateText("Settings", "rw"), "Igenamiterere");
  assert.equal(translateText("Settings", "en"), "Settings");
});

test("translated templates preserve dynamic values", () => {
  assert.equal(translateText("Welcome, {name}.", "fr", { name: "Amina" }), "Bienvenue, Amina.");
  assert.equal(
    translateText("Welcome, Amina.", "rw"),
    "Murakaza neza, Amina."
  );
});

test("untranslated dynamic content safely falls back to its original text", () => {
  assert.equal(translateText("A name not in the dictionary", "fr"), "A name not in the dictionary");
});

test("administrator dashboard labels and dynamic counts are translated", () => {
  assert.equal(translateText("Administrator dashboard", "fr"), "Tableau de bord administrateur");
  assert.equal(translateText("5 active · 2 inactive", "rw"), "5 barakora · 2 ntibakora");
  assert.equal(translateText("3 care records", "fr"), "3 dossiers de soins");
});
