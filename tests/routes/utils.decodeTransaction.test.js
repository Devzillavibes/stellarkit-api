'use strict';

const request = require('supertest');
const {
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
  Asset,
  BASE_FEE,
} = require('@stellar/stellar-sdk');

const app = require('../../../src/app');

// Helper to build a signed, base64-encoded transaction envelope from a list of operations.
function buildEnvelope(operations, sourceKeypair) {
  const source = sourceKeypair || Keypair.random();
  const account = {
    accountId: () => source.publicKey(),
    sequenceNumber: () => '0',
    incrementSequenceNumber: () => {},
  };

  const builder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  });

  operations.forEach((op) => builder.addOperation(op));

  const tx = builder.setTimeout(0).build();
  tx.sign(source);
  return tx.toEnvelope().toXDR('base64');
}

describe('POST /utils/decode-transaction', () => {
  it('decodes a changeTrust operation with type, asset, and limit fields', async () => {
    const source = Keypair.random();
    const asset = new Asset(
      'TESTASSET',
      'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'
    );

    const xdr = buildEnvelope(
      [
        Operation.changeTrust({
          asset,
          limit: '1000',
        }),
      ],
      source
    );

    const res = await request(app)
      .post('/utils/decode-transaction')
      .send({ xdr })
      .expect(200);

    expect(res.body).toBeDefined();
    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data.operations)).toBe(true);
    expect(res.body.data.operations).toHaveLength(1);

    const op = res.body.data.operations[0];
    expect(op.type).toBe('change_trust');
    expect(op.line).toBeDefined();
    expect(op.line.code).toBe('TESTASSET');
    expect(op.line.issuer).toBe(
      'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'
    );
    expect(op.limit).toBe('1000');
  });

  it('decodes a manageOffer operation with type, selling, buying, amount, and price fields', async () => {
    const source = Keypair.random();
    const selling = new Asset(
      'SELL',
      'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'
    );
    const buying = new Asset(
      'BUY',
      'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'
    );

    const xdr = buildEnvelope(
      [
        Operation.manageSellOffer({
          selling,
          buying,
          amount: '50',
          price: '2.5',
          offerId: '0',
        }),
      ],
      source
    );

    const res = await request(app)
      .post('/utils/decode-transaction')
      .send({ xdr })
      .expect(200);

    expect(res.body.data.operations).toHaveLength(1);

    const op = res.body.data.operations[0];
    expect(op.type).toBe('manage_sell_offer');
    expect(op.selling).toBeDefined();
    expect(op.selling.code).toBe('SELL');
    expect(op.buying).toBeDefined();
    expect(op.buying.code).toBe('BUY');
    expect(op.amount).toBe('50');
    expect(op.price).toBeDefined();
  });

  it('decodes a setOptions operation with type and relevant options fields', async () => {
    const source = Keypair.random();
    const signerKeypair = Keypair.random();

    const xdr = buildEnvelope(
      [
        Operation.setOptions({
          masterWeight: 1,
          lowThreshold: 1,
          medThreshold: 2,
          highThreshold: 3,
          signer: {
            ed25519PublicKey: signerKeypair.publicKey(),
            weight: 1,
          },
        }),
      ],
      source
    );

    const res = await request(app)
      .post('/utils/decode-transaction')
      .send({ xdr })
      .expect(200);

    expect(res.body.data.operations).toHaveLength(1);

    const op = res.body.data.operations[0];
    expect(op.type).toBe('set_options');
    expect(op.masterWeight).toBe(1);
    expect(op.lowThreshold).toBe(1);
    expect(op.medThreshold).toBe(2);
    expect(op.highThreshold).toBe(3);
    expect(op.signer).toBeDefined();
    expect(op.signer.ed25519PublicKey).toBe(signerKeypair.publicKey());
    expect(op.signer.weight).toBe(1);
  });

  it('decodes multiple operations in order with correct indices', async () => {
    const source = Keypair.random();
    const asset = new Asset(
      'MULTI',
      'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'
    );
    const selling = new Asset(
      'SELL',
      'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'
    );
    const buying = new Asset(
      'BUY',
      'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'
    );

    const xdr = buildEnvelope(
      [
        Operation.changeTrust({ asset, limit: '500' }),
        Operation.manageSellOffer({
          selling,
          buying,
          amount: '10',
          price: '1',
          offerId: '0',
        }),
        Operation.setOptions({ masterWeight: 1 }),
      ],
      source
    );

    const res = await request(app)
      .post('/utils/decode-transaction')
      .send({ xdr })
      .expect(200);

    expect(res.body.data.operationCount).toBe(3);
    expect(res.body.data.operations).toHaveLength(3);

    const ops = res.body.data.operations;
    expect(ops[0].type).toBe('change_trust');
    expect(ops[0].index).toBe(0);
    expect(ops[1].type).toBe('manage_sell_offer');
    expect(ops[1].index).toBe(1);
    expect(ops[2].type).toBe('set_options');
    expect(ops[2].index).toBe(2);
  });
});