import { triggerAsyncId } from "async_hooks";
import express from 'express';
import { subscribeToChannels, subscribeToInvoices, subscribeToTransactions } from 'ln-service';
import { InvoiceUser, setupMongoConnection, Transaction, User } from "./mongodb";
import { sendInvoicePaidNotification, sendNotification } from "./notification";
import { IDataNotification } from "./types";
import { getAuth, logger } from './utils';
import { WalletFactory } from "./walletFactory";
const lnService = require('ln-service');

export async function onchainTransactionEventHandler(tx) {
  logger.debug({tx})

  if (tx.is_outgoing) {

    if (!tx.is_confirmed) {
      return
      // FIXME 
      // we have to return here because we will not know the whose user the the txid belond to
      // this is because of limitation for lnd onchain wallet. we only know the txid after the 
      // transaction has been sent. and this events is trigger before
    }

    await Transaction.updateMany({ hash: tx.id }, { pending: false })
    const entry = await Transaction.findOne({ account_path: { $all : ["Liabilities", "Customer"] }, hash: tx.id })

    const title = `Your on-chain transaction has been confirmed`
    const data: IDataNotification = {
      type: "onchain_payment",
      hash: tx.id,
      amount: tx.tokens,
    }
    await sendNotification({uid: entry.account_path[2], title, data})
  } else {
    let _id
    try {
      ({ _id } = await User.findOne({ onchain_addresses: { $in: tx.output_addresses } }, { _id: 1 }))
      if (!_id) {
        //FIXME: Log the onchain address, need to first find which of the tx.output_addresses
        // belongs to us
        const error = `No user associated with the onchain address`
        logger.warn(error)
        return
      }
    } catch (error) {
      logger.error(error, "issue in onchainTransactionEventHandler to get User id attached to output_addresses")
      throw error
    }
    const data: IDataNotification = {
      type: "onchain_receipt",
      amount: Number(tx.tokens),
      txid: tx.id
    }
    const title = tx.is_confirmed ?
      `Your wallet has been credited with ${tx.tokens} sats` :
      `You have a pending incoming transaction of ${tx.tokens} sats`
    await sendNotification({ title, uid: _id, data })
  }
}

export const onInvoiceUpdate = async invoice => {
  logger.debug(invoice)

  if (!invoice.is_confirmed) {
    return
  }

  // FIXME: we're making 2x the request to Invoice User here. One in trigger, one in lighning.
  const invoiceUser = await InvoiceUser.findOne({ _id: invoice.id, pending: true })
  if (invoiceUser) {
    const uid = invoiceUser.uid
    const hash = invoice.id as string

    const wallet = WalletFactory({ uid, currency: invoice.currency })
    await wallet.updatePendingInvoice({ hash })
    await sendInvoicePaidNotification({amount: invoice.received, hash, uid})
  } else {
    logger.warn({invoice}, "we received an invoice but had no user attached to it")
  }
}

const main = async () => {	
  const { lnd } = lnService.authenticatedLndGrpc(getAuth())

  lnService.getWalletInfo({ lnd }, (err, result) => {
    logger.debug(err, result)
  });

  const subInvoices = subscribeToInvoices({ lnd });
  subInvoices.on('invoice_updated', onInvoiceUpdate)

  const subTransactions = subscribeToTransactions({ lnd });
  subTransactions.on('chain_transaction', onchainTransactionEventHandler);
  
  const subChannels = subscribeToChannels({ lnd });
  subChannels.on('channel_opened', channel => {
    logger.info(channel)
  })
}

const healthCheck = () => {
  const { lnd } = lnService.authenticatedLndGrpc(getAuth())

  const app = express()
  const port = 8888
  app.get('/health', (req, res) => {
    lnService.getWalletInfo({ lnd }, (err,) => !err ? res.sendStatus(200) : res.sendStatus(500));
  })
  app.listen(port, () => logger.info(`Health check listening on port ${port}!`))
}

// only execute if it is the main module
if (require.main === module) {
  healthCheck()
  setupMongoConnection().then(main).catch((err) => logger.error(err))
}