const Router = require('express').Router
const passport = require('passport')
const logger = require('../../logger')('router:auth')

const { ClientError, ServerError } = require('../../errors')

module.exports = (app) => {
  const router = Router()

  router.post('/login', (req, res, next) => {
    if (app.config.services.authentication.strategies.ldapauth) {
      app.service.authentication.middlewares.ldapPassport(req, res, next)
    } else {
      app.service.authentication.middlewares.basicPassport(req, res, next)
    }
  }, async (req, res, next) => {
    try {
      let user = req.user
      let passport = req.passport
      let customerName = req.query.customer || null

      let session = await app.service.authentication.membersLogin({ user, passport, customerName })
      res.json({ access_token: session.token, credential: session.credential })
    } catch (err) {
      next(err)
    }
  })

  router.post(
    '/login/local',
    app.service.authentication.middlewares.basicPassport,
    async (req, res, next) => {
      try {
        let user = req.user
        let passport = req.passport
        let customerName = req.query.customer || null

        let session = await app.service.authentication.membersLogin({ user, passport, customerName })
        res.json({ access_token: session.token, credential: session.credential })
      } catch (err) {
        next(err)
      }
    }
  )

  router.post('/login/enterprise', (req, res, next) => {

  })

  /**
   *
   * send reset password email
   *
   */
  router.post('/password/recover', async (req, res, next) => {
    try {
      if (
        app.config.services.authentication.strategies.ldapauth &&
        ! app.config.services.authentication.localBypass
      ) {
        throw new ClientError('ldapSet')
      }

      const email = req.body.email
      if (!email) {
        throw new ClientError('Email Required')
      }

      const user = await app.models.users.uiUser.findOne({ email: email })
      if (!user) {
        throw new ClientError('User not found', { statusCode: 404 })
      }

      // @TODO verify local passport exists and is valid
      if (user.enabled) {
        await app.service
          .notifications
          .email
          .sendPasswordRecoverMessage({ user })
      } else {
        user.invitation_token = app.service.authentication.issue({ email: user.email })
        await app.service
          .notifications
          .email
          .sendActivationMessage({ user })
        await user.save()
      }

      res.json({})
    } catch (err) {
      next(err)
    }
  })

  router.get('/password/recoververify', (req, res, next) => {
    try {
      if (!req.query.token) {
        throw new ClientError("Missing param token.")
      }

      let decoded = app.service.authentication.verify(req.query.token)

      var resetToken = app.service.authentication.issue({email: decoded.email, expiresIn: "5m" })
      return res.json({ resetToken })
    } catch (err) {
      next(err)
    }
  })

  router.put('/password/reset', async (req, res, next) => {
    try {
      if (!req.body.token) {
        return res.status(400).json({ message: "Missing param token." })
      }
      if (!req.body.password) {
        return res.status(400).json({ message: "Missing param password." })
      }
      if (!req.body.confirmation) {
        return res.status(400).json({ message: "Missing param confirmation." })
      }

      if (req.body.password != req.body.confirmation) {
        return res.status(400).json({ message: "Passwords dont match." })
      }

      let decoded = app.service.authentication.verify(req.body.token)
      let email = decoded.email

      let user = await app.models.users.uiUser.findOne({ email: email })
      if (!user) {
        return res.status(404).json({ message: "User not found." })
      }

      let passport = await app.models.passport.findOne({ protocol: 'local', user_id: user.id })
      if (!passport) {
        return res.status(404).json({ message: "User passport not found." })
      }
      passport.password = await passport.hashPassword(req.body.password)
      await passport.save()

      res.json({})
    } catch (err) {
      if (err.status) { res.status(err.status).json( { message: err.message }) }
      else res.status(500).json('Internal Server Error')
    }
  })

  router.post('/password/change', async (req, res, next) => {
    try {
      if (!req.body.password) {
        return res.status(400).json({ message: "Missing param password." })
      }
      if (!req.body.newPassword) {
        return res.status(400).json({ message: "Missing param new password." })
      }
      if (!req.body.confirmPassword) {
        return res.status(400).json({ message: "Missing param confirm password." })
      }
      if (!req.body.id) {
        return res.status(400).json({ message: "Missing param user id." })
      }
      if (req.body.newPassword != req.body.confirmPassword) {
        return res.status(400).json({ message: "New passwords dont match." })
      }

      let user = await app.models.users.uiUser.findById(req.body.id)
      if (!user) {
        return res.status(404).json({ message: "User not found." })
      }

      let passport = await app.models.passport.findOne({ protocol: 'local', user_id: user.id })
      if (!passport) {
        return res.status(404).json({ message: "User passport not found." })
      }

      await passport.validatePassword(req.body.password)

      passport.password = await passport.hashPassword(req.body.newPassword)
      await passport.save()

      res.json({})
    } catch (err) {
      if (err.status) { res.status(err.status).json( { message: err.message }) }
      else res.status(500).json('Internal Server Error')
    }
  })

  return router
}
