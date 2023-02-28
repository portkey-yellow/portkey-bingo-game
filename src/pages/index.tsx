export { default } from "page-components/BingoGame";
import { NextPageContext } from "next";
import AElf from "aelf-sdk";
import { API } from "constants/api";
import { get } from "utils/axios";
export const getServerSideProps = async (ctx: NextPageContext) => {
  // const wallet = AElf.wallet.createNewWallet();
  // const aelf = new AElf(new AElf.providers.HttpProvider('http://127.0.0.1:1235'));
  // const bingoAddress = '2LUmicHyH4RXrMjG4beDwuDsiWJESyLkgkwPdGTR8kahRzq5XS';
  return {
    props: {
      // datassr: autoData,
      // wallet,
    },
  };
};
