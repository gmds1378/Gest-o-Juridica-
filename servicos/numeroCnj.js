// Número CNJ: NNNNNNN-DD.AAAA.J.TR.OOOO (20 dígitos sem pontuação).
// A normalização é só para consulta/comparação — o valor cadastrado no
// processo (formatado) não é alterado.

function normalizar(numero) {
  return String(numero || '').replace(/\D/g, '');
}

function analisar(numero) {
  const normalizado = normalizar(numero);
  if (normalizado.length !== 20) return null;
  return {
    sequencial: normalizado.slice(0, 7),
    dv: normalizado.slice(7, 9),
    ano: normalizado.slice(9, 13),
    justica: normalizado.slice(13, 14),
    tribunal: normalizado.slice(14, 16),
    origem: normalizado.slice(16, 20),
    normalizado
  };
}

module.exports = { normalizar, analisar };
