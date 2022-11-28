
const { expect } = require('chai');
const { ethers } = require('hardhat');

const toWei = (num) => ethers.utils.parseEther(num.toString());
const fromWei = (num) => ethers.utils.formatEther(num);

describe('NFTMarketplace', () => {
  let deployer; let addr1; let addr2; let nft; let marketplace;
  const feepercent = 1;
  const URI = 'SAMPLE URI';
  beforeEach(async () => {
    const NFT = await ethers.getContractFactory('NFT');
    const Marketplace = await ethers.getContractFactory('Marketplace');
    [deployer, addr1, addr2] = await ethers.getSigners();

    nft = await NFT.deploy();
    marketplace = await Marketplace.deploy(feepercent);
  });

  describe('Deployment', () => {
    it('Should track name and symbol of the nft collection', async () => {
      expect(await nft.name()).to.equal('DApp NFT');
      expect(await nft.symbol()).to.equal('DAPP');
    });
    it('Should track feeAcount of the marketplace', async () => {
      expect(await marketplace.feeAccount()).to.equal(deployer.address);
      expect(await marketplace.feePercent()).to.equal(feepercent);
    });

    describe('Minting NFTs', () => {
      it('Should track each minted NFT', async () => {
        await nft.connect(addr1).mint(URI);
        expect(await nft.tokenCount()).to.equal(1);
        expect(await nft.balanceOf(addr1.address)).to.equal(1);
        expect(await nft.tokenURI(1)).to.equal(URI);

        await nft.connect(addr2).mint(URI);
        expect(await nft.tokenCount()).to.equal(2);
        expect(await nft.balanceOf(addr2.address)).to.equal(1);
        expect(await nft.tokenURI(2)).to.equal(URI);
      });
    });
    describe('Making marketplace items', () => {
      beforeEach(async () => {
        await nft.connect(addr1).mint(URI);
        await nft.connect(addr1).setApprovalForAll(marketplace.address, true);
      });
      it('Should track newly created item, transer NFT from seller to marketplace and aemit offered event', async () => {
        await expect(marketplace.connect(addr1).makeItem(nft.address, 1, toWei(1)))
          .to.emit(marketplace, 'Offered')
          .withArgs(
            1,
            nft.address,
            1,
            toWei(1),
            addr1.address,
          );

        expect(await nft.ownerOf(1)).to.equal(marketplace.address);

        expect(await marketplace.itemCount()).to.equal(1);

        const item = await marketplace.items(1);
        expect(item.itemId).to.equal(1);
        expect(item.nft).to.equal(nft.address);
        expect(item.tokenId).to.equal(1);
        expect(item.price).to.equal(toWei(1));
        expect(item.sold).to.equal(false);
      });

      it('Should fail if price is set to zero', async () => {
        await expect(marketplace.connect(addr1).makeItem(nft.address, 1, 0))
          .to.be.revertedWith('Price must be greater than zero');
      });
    });

    describe('Purchasing marketplace items', () => {
      const price = 2;
      let totalPriceInWei;

      beforeEach(async () => {
        await nft.connect(addr1).mint(URI);

        await nft.connect(addr1).setApprovalForAll(marketplace.address, true);

        await marketplace.connect(addr1).makeItem(nft.address, 1, toWei(price));
      });

      it('Should update item as sold, pay seller, transer NFT to buyer, charge fees and emit a Bought event', async () => {
        const sellerInitalEthBal = await addr1.getBalance();
        const feeAccountInitialEthBal = await deployer.getBalance();
        // fetch items total price (market fees + item price)
        totalPriceInWei = await marketplace.getTotalPrice(1);
        // addr 2 purchases item.
        await expect(marketplace.connect(addr2).purchaseItem(1, { value: totalPriceInWei }))
          .to.emit(marketplace, 'Bought')
          .withArgs(
            1,
            nft.address,
            1,
            toWei(price),
            addr1.address,
            addr2.address,
          );

        const sellerFinalEthBal = await addr1.getBalance();
        const feeAcountFinalEthBal = await deployer.getBalance();

        expect(+fromWei(sellerFinalEthBal)).to.equal(+price + +fromWei(sellerInitalEthBal));

        const fee = (feepercent / 100) * price;

        expect(+fromWei(feeAcountFinalEthBal)).to.equal(+fee + +fromWei(feeAccountInitialEthBal));

        expect(await nft.ownerOf(1)).to.equal(addr2.address);

        expect((await marketplace.items(1)).sold).to.equal(true);
      });

      // it("Should fail for invalid item ids, sold items and when not enough ether is paid",async function() {

      //     await expect(marketplace.connect(addr2).purchaseItem(2,{value:totalPriceInWei}))
      //     .to.be.revertedWith("Item Doesn't exists");

      //     await expect(marketplace.connect(addr2).purchaseItem(0,{value:totalPriceInWei}))
      //     .to.be.revertedWith("Item Doesn't exists");

      //     await  expect(marketplace.connect(addr2).purchaseItem(1,{value:toWei(price)}))
      //     .to.be.revertedWith("Not enough ether to cover item price and market fee")

      //     await  marketplace.connect(addr2).purchaseItem(1,{value:totalPriceInWei});

      //     await expect(marketplace.connect(deployer).purchaseItem(1,{value:totalPriceInWei}))
      //     .to.be.revertedWith("Item already sold");

      // });
    });
  });
});
