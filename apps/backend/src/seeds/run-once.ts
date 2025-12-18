// apps/backend/src/seeds/run-once.ts
import { main as ensureBase } from './ensureBaseServices'
import { ensureSpecialistSpecialty } from './ensureSpecialistSpecialty'

async function main() {
  await ensureBase() // asegura "Visita técnica" en cada rubro

  // Crea el especialista si no existe y lo vincula a albañilería
  await ensureSpecialistSpecialty({
    specialistEmail: 'albanileria.demo2@solucity.local',
    categorySlug: 'albanileria',
    createIfMissing: true,
    name: 'Juan Albañil',
    passwordPlain: 'Solucity123', // podés cambiarlo luego
    phone: '3510000000',
  })

  console.log('✅ run-once listo')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

