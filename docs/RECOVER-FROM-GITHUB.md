# Recuperar as presenças da cópia SQLite no GitHub

O ficheiro `data/briosa.sqlite` já está no repositório e é uma fotografia anterior da base de dados. **Não contém necessariamente as presenças mais recentes**, que estavam no volume do Railway.

## Passos (sem Railway nem pagamentos)

1. Descarrega o repositório pelo GitHub, botão **Code → Download ZIP**, e descomprime.
2. Abre o Terminal na pasta do projeto e executa `npm ci`.
3. Corre `npm run recover:attendances`. O script abre `data/briosa.sqlite` em **modo de leitura** e grava `briosa-attendances-recovery.json` no teu Mac. Indica quantos IDs encontrou.
4. No Briosa Hub, inicia sessão na conta Supabase usada no PC e no telemóvel.
5. Expande **Recuperar presenças antigas** e seleciona o JSON. O importador **acrescenta IDs sem apagar as presenças que já existam**.
6. Atualiza a página **Jogos a que fui** nos dois dispositivos para confirmar.

**Não publiques nem faças commit do JSON**. Pode conter o teu histórico pessoal.

Se o script disser **0 presenças**, esta versão do GitHub não guardou as presenças anteriores: elas podem existir apenas no volume Railway. Não é possível reconstruir presenças pessoais a partir da lista pública de jogos.

Os jogos e os logótipos do SQLite já são exportados durante `npm run build`. Os resultados recentes só ficam atualizados depois de o workflow `Update Briosa archive` correr e fazer commit: visita GitHub Actions, executa-o manualmente e confirma se passou. Não declares os dados atuais até essa execução ser validada.
