const express = require('express')
const mongoose = require('mongoose')
const logger = require('../logger')('router:token')
const crypto = require('crypto')
const CredentialsConstants = require('../constants/credentials')
const PassportConstants = require('../constants/passport')

const { ClientError, ServerError } = require('../errors')

module.exports = (app) => {
  const router = express.Router()

  const aclsMiddleware = () => {
    let creds = [
      CredentialsConstants.ROOT,
      CredentialsConstants.OWNER,
      CredentialsConstants.ADMIN
    ]
    return credentialControl(creds)
  }

  router.get('/', aclsMiddleware(), async (req, res, next) => {
    try {
      const customer_id = req.session.customer_id
      let integrationMembers = []

      const customer = await app.models.customer.findById(customer_id)
      if (!customer) {
        throw new ClientError('Forbidden', { code: 'OrganizationAccessError', statusCode: 403 })
      }

      const members = await app.models.member.find({
        customer_id,
        credential: CredentialsConstants.INTEGRATION
      })

      for (const member of members) {
        await member.populate({
          path: 'user',
          select: 'id username'
        }).execPopulate()

        let session = await app.models.session.findOne({
          user_id: member.user._id,
          customer_id: customer_id
        })

        if (session) {
          integrationMembers.push({
            id: member.id,
            username: member.user.username,
            token: session.token
          })
        }
      }

      res.json(integrationMembers)
    } catch (err) {
      next(err)
    }
  })

  router.post('/', aclsMiddleware(), async (req, res, next) => {
    try {
      const data = req.body
      const customer_id = req.session.customer_id

      let customer = await app.models.customer.findById(customer_id)
      if (!customer) {
        throw new ClientError('Forbidden', { code: 'OrganizationAccessError', statusCode: 403 })
      }

      const { member, user } = await createIntegrationToken(app, customer, data)
      const tokenSession = await app.service.authentication.createSession({
        member: member,
        protocol: PassportConstants.PROTOCOL_LOCAL,
        expiration: null // never expires
      })

      const token = {
        id: member.id,
        username: user.username,
        token: tokenSession.token
      }

      res.json(token)
    } catch (err) {
      next(err)
    }
  })

  router.delete('/:id', aclsMiddleware(), async (req, res, next) => {
    try {
      const id = req.params.id
      const session = req.session

      const member = await app.models.member.findById(id)
      if (!member) {
        throw new ClientError('Member Not Found', {statusCode: 404})
      }

      const user_id = member.user_id

      app.models.session
        .findOne({ user_id, customer_id: session.customer_id })
        .then(session => session && session.remove())

      app.models.passport
        .findOne({ user_id })
        .then(passport => passport && passport.remove())

      app.models.users.botUser
        .findById(user_id)
        .then(user => user && user.remove())

      member.remove()

      res.json({})
    } catch (err) {
      next(err)
    }
  })

  return router
}

const randomToken = () => {
  return crypto.randomBytes(20).toString('hex')
}

const createIntegrationToken = async (app, customer, data) => {
  let cliendId = randomToken()
  let clientSecret = randomToken()
  let username = data.username.replace(/[^a-zA-Z0-9\.\_]/ig,'_')

  let userData = {
    username: username,
    email: `${customer.name}-${username}-integration@theeye.io`,
    name: username,
    enabled: true,
    invitation_token: null,
    devices: null,
    notifications: null ,
    onboardingCompleted: true ,
    credential: null
  }

  let user = await app.models.users.botUser.create(userData)

  let passportData = {
    protocol: 'local',
    provider: 'theeye',
    password: clientSecret,
    identifier: cliendId,
    tokens: {
      access_token: null,
      refresh_token: clientSecret
    },
    user: user._id,
    user_id: user._id
  }

  let passport = await app.models.passport.create(passportData)

  let memberData = {
    user: user._id,
    user_id: user._id,
    customer: customer._id,
    customer_id:  customer._id,
    customer_name: customer.name,
    credential: CredentialsConstants.INTEGRATION,
    enabled: true
  }

  let member = await app.models.member.create(memberData)

  return { member, passport, user }
}

const credentialControl = (requiredCredentials) => {
  return (req, res, next) => {
    const checkCredentials = (credential, accepted) => {
      return (accepted.indexOf(credential) !== -1)
    }

    let hasAccessLevel= checkCredentials(req.session.credential, requiredCredentials)
    if(!hasAccessLevel) {
        return res.status(403).json('Forbidden')
    }
    return next()
  }
}
