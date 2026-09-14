describe('Budget Watchdog smoke', () => {
  it('uygulama açılır', () => {
    cy.visit('/')

    cy.get('body').should('be.visible')
    cy.get('ion-app').should('exist')

    cy.location('pathname').should(path => {
      expect([
        '/welcome',
        '/permissions',
        '/base-currency-selection',
        '/first-wallet',
        '/tabs/home',
        '/tabs/overview',
      ]).to.include(path)
    })
  })
})
