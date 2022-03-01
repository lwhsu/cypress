describe('ESM Support', () => {
  it('can scaffold an ESM project', () => {
    cy.scaffoldProject('pristine-esm')
    cy.openProject('pristine-esm')
    cy.visitLaunchpad()
    cy.contains('E2E Testing').click()
    cy.contains('Next Step').click()
    cy.findByRole('button', { name: 'Continue' }).click()
    cy.contains('Error')
    cy.withCtx(async (ctx, o) => {
      const dedent = o.require('dedent')

      await ctx.actions.file.removeFileInProject('cypress.config.js')
      await ctx.actions.file.writeFileInProject('cypress.config.mjs', dedent`
        import { defineConfig } from 'cypress'
  
        export default defineConfig({
          e2e: {
            setupNodeEvents(on, config) {
              // implement node event listeners here
            },
          },
        })
      `)
    })

    cy.contains('Try again').click()
    cy.contains('E2E Testing').click()
    cy.contains('Choose a Browser')
  })
})
