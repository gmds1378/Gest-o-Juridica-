// Reimporta publicacoes a partir das copias cruas salvas em dados/aasp-brutos/.
//
// Serve para o unico cenario em que a AASP ja marcou as publicacoes como baixadas
// (e portanto nao as devolve de novo) mas a gravacao no banco falhou. Rodar:
//
//   npm run reimportar-aasp
//
// E seguro rodar quantas vezes quiser: publicacoes ja importadas sao ignoradas.

const fs = require('fs');
const path = require('path');
const aasp = require('../servicos/aaspIntimacoes');

if (!fs.existsSync(aasp.PASTA_BRUTOS)) {
  console.log('Nenhuma copia crua encontrada - nada a reimportar.');
  process.exit(0);
}

const arquivos = fs.readdirSync(aasp.PASTA_BRUTOS).filter((nome) => nome.endsWith('.json')).sort();

if (!arquivos.length) {
  console.log('Nenhuma copia crua encontrada - nada a reimportar.');
  process.exit(0);
}

let totalNovas = 0;
let falhas = 0;

for (const nome of arquivos) {
  const caminho = path.join(aasp.PASTA_BRUTOS, nome);
  try {
    const { total, novas } = aasp.reimportarArquivo(caminho);
    totalNovas += novas;
    console.log(`${nome}: ${total} publicacao(oes) no arquivo, ${novas} importada(s) agora.`);
  } catch (erro) {
    falhas++;
    console.error(`${nome}: FALHOU - ${erro.message}`);
  }
}

console.log(`\nConcluido. ${totalNovas} publicacao(oes) nova(s) importada(s), ${falhas} arquivo(s) com falha.`);
