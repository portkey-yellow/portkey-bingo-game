import React, { useCallback, useEffect, useRef, useState } from "react";
import styles from "./styles.module.less";
import AElf from "aelf-sdk";
import { SignIn } from "@portkey/did-ui-react";
import { did } from "@portkey/did-ui-react/src/utils/did";
import { getContractBasic, ContractBasic } from "@portkey/contracts";
import { DIDWalletInfo } from "@portkey/did-ui-react/src/components/types";
import { useLocalStorage } from "react-use";
import { RegisterStatus } from "types";
import { useDelay } from "hooks/common";

const { sha256 } = AElf.utils;
const bingoAddress = "2AsEepqiFCRDnepVheYYN5LK7nvM2kUoXgk2zLKu1Zneh8fwmF";

const registerTextMap = {
  [RegisterStatus.LOADING]: "Loading",
  [RegisterStatus.WAIT]: "Please wait...",
  [RegisterStatus.REGISTER]: "Register",
  [RegisterStatus.APPROVE]: "Approve",
  [RegisterStatus.LOGIN]: "Login",
};

const CHAIN_ID = "tDVV";

export default function Home() {
  const caContractRef = useRef<ContractBasic>();
  const multiTokenContractRef = useRef<ContractBasic>();
  const loadingRef = useRef(false);
  const txIdRef = useRef("");
  const aelfRef = useRef<any>();
  const walletRef = useRef<DIDWalletInfo>();
  const [isLoaderShow, setIsLoaderShow] = useState(false);
  const [isSiteShow, setIsSiteShow] = useState(false);
  const [isLoginShow, setIsLoginShow] = useState(true);
  const [isPlayShow, setIsPlayShow] = useState(true);
  const [isBingoShow, setIsBingoShow] = useState(false);
  const [balanceValue, setBalanceValue] = useState("loading...");
  const [balanceInputValue, setBalanceInputValue] = useState("");
  const [open, setOpen] = useState<boolean>();
  const delay = useDelay();
  const [wallet, setWallet] = useLocalStorage<DIDWalletInfo | null>("wallet");
  const [registerStatus, setRegisterStatus] = useState<RegisterStatus>(
    RegisterStatus.WAIT
  );
  const init = useCallback(async () => {
    const chainsInfo = await did.services.getChainsInfo();
    const chainInfo = chainsInfo.find((chain) => chain.chainId === CHAIN_ID);
    if (!chainInfo) {
      alert("chain is not running");
      return;
    }

    const aelf = new AElf(new AElf.providers.HttpProvider(chainInfo.endPoint));
    aelfRef.current = aelf;
    if (!aelf.isConnected()) {
      alert("Blockchain Node is not running.");
    }
    setRegisterStatus(RegisterStatus.LOGIN);
  }, []);

  useEffect(() => {
    if (wallet) {
      walletRef.current = {
        ...wallet,
        walletInfo: {
          ...wallet.walletInfo,
          wallet: AElf.wallet.getWalletByPrivateKey(
            wallet.walletInfo.privateKey
          ),
        },
      } as any;
      console.log(walletRef.current, "====walletRef.current");
    }
    init();
  }, []);

  const initContract = useCallback(async () => {
    if (!walletRef.current) {
      alert("Wallet is error");
      return;
    }
    const chainsInfo = await did.services.getChainsInfo();
    const chainInfo = chainsInfo.find((chain) => chain.chainId === CHAIN_ID);

    if (!aelfRef.current || !chainInfo?.caContractAddress) return;

    const aelf = aelfRef.current;
    const wallet = walletRef.current;
    caContractRef.current = await getContractBasic({
      contractAddress: chainInfo?.caContractAddress,
      account: wallet.walletInfo.wallet,
      rpcUrl: chainInfo?.endPoint,
    });
    const chainStatus = await aelf.chain.getChainStatus();
    const zeroC = await getContractBasic({
      contractAddress: chainStatus.GenesisContractAddress,
      account: wallet.walletInfo.wallet,
      rpcUrl: chainInfo?.endPoint,
    });
    const tokenContractAddress = await zeroC.callViewMethod(
      "GetContractAddressByName",
      sha256("AElf.ContractNames.Token")
    );
    const multiTokenContract = await getContractBasic({
      contractAddress: tokenContractAddress.data,
      account: wallet.walletInfo.wallet,
      rpcUrl: chainInfo?.endPoint,
    });
    multiTokenContractRef.current = multiTokenContract;

    await delay();
    setRegisterStatus(RegisterStatus.REGISTER);
    console.log("initContract");
  }, [delay]);

  const getBalance = useCallback(async () => {
    const multiTokenContract = multiTokenContractRef.current;
    const wallet = walletRef.current;
    if (!multiTokenContract || !wallet) return;

    setBalanceValue("loading...");
    await delay();
    const result = await multiTokenContract.callViewMethod("GetBalance", {
      symbol: "CARD",
      owner: wallet.caInfo.caAddress,
    });
    // const aelfResult = await multiTokenContract.callViewMethod("GetBalance", {
    //   symbol: "CARD",
    //   owner: wallet.caInfo.caAddress,
    // });

    console.log("result: ", result);
    // console.log("aelfResult: ", aelfResult);
    const difference = result.data.balance - Number(balanceValue);
    setBalanceValue(result.data.balance);
    return difference;
  }, [balanceValue, delay]);

  const register = useCallback(async () => {
    const caContract = caContractRef.current;
    const wallet = walletRef.current;
    if (!wallet || !caContract) throw new Error("no wallet");

    await caContract.callSendMethod(
      "ManagerForwardCall",
      wallet.walletInfo.wallet.address,
      {
        caHash: wallet.caInfo.caHash,
        contractAddress: bingoAddress,
        methodName: "Register",
        args: null,
      }
    );
    setRegisterStatus(RegisterStatus.LOADING);
    await delay();
    getBalance();

    alert("Congratulations on your successful registration！Please approve");
    setRegisterStatus(RegisterStatus.APPROVE);
  }, [delay, getBalance]);

  const approve = useCallback(async () => {
    const wallet = walletRef.current;
    const caContract = caContractRef.current;
    const multiTokenContract = multiTokenContractRef.current;

    if (!caContract || !wallet || !multiTokenContract)
      throw new Error("no caContract or wallet or multiTokenContract");

    setRegisterStatus(RegisterStatus.LOADING);
    const approve = await caContract.callSendMethod(
      "ManagerForwardCall",
      wallet.walletInfo.wallet.address,
      {
        caHash: wallet.caInfo.caHash,
        contractAddress: multiTokenContract.address,
        methodName: "Approve",
        args: {
          symbol: "CARD",
          spender: bingoAddress,
          amount: "100000000000000000000",
        },
      }
    );
    console.log("approve", approve);

    getBalance();
    setRegisterStatus(RegisterStatus.APPROVE);
    alert("Congratulations on your successful approve");
    setIsSiteShow(true);
    setIsLoginShow(false);
  }, [delay, getBalance]);

  const onLoginClick = useCallback(async () => {
    if (registerStatus === RegisterStatus.LOGIN) {
      if (walletRef.current) {
        initContract();
      } else {
        setRegisterStatus(RegisterStatus.LOADING);
        setOpen(true);
      }
      return;
    }

    if (loadingRef.current) return;
    loadingRef.current = true;
    setIsLoaderShow(true);
    try {
      if (registerStatus === RegisterStatus.REGISTER) {
        await register();
      } else {
        await approve();
      }
    } catch (err) {
      console.log(err);
    }
    loadingRef.current = false;
    setIsLoaderShow(false);
  }, [registerStatus, register, approve]);

  const onPlay = useCallback(async () => {
    const caContract = caContractRef.current;
    const wallet = walletRef.current;
    if (!caContract || !wallet) return;

    const reg = /^[1-9]\d*$/;
    const value = parseInt(balanceInputValue, 10);
    if (value < 2) {
      return alert("A minimum bet of 2 cards!");
    }

    if (reg.test(value.toString()) && value <= Number(balanceValue)) {
      setIsLoaderShow(true);
      try {
        const approve = await caContract.callSendMethod(
          "ManagerForwardCall",
          wallet.walletInfo.wallet.address,
          {
            caHash: wallet.caInfo.caHash,
            contractAddress: bingoAddress,
            methodName: "Play",
            args: {
              value,
            },
          }
        );

        console.log("Play result: ", approve);
        setIsPlayShow(false);
        txIdRef.current = approve.transactionId || "";
        await delay(400);
        setIsBingoShow(true);
      } catch (err) {
        setIsPlayShow(true);
        setIsBingoShow(false);
        console.log(err);
      }
      setIsLoaderShow(false);
    } else if (value > Number(balanceValue)) {
      alert("Please enter a number less than the number of cards you own!");
    } else {
      alert("Please enter a positive integer greater than 0!");
    }
  }, [balanceInputValue, balanceValue, delay]);

  const onBingo = useCallback(async () => {
    const caContract = caContractRef.current;
    const wallet = walletRef.current;
    if (!caContract || !wallet) return;
    try {
      const txId = txIdRef.current;
      const approve = await caContract.callSendMethod(
        "ManagerForwardCall",
        wallet.walletInfo.wallet.address,
        {
          caHash: wallet.caInfo.caHash,
          contractAddress: bingoAddress,
          methodName: "Bingo",
          args: txId,
        }
      );
      console.log("Bingo", approve);
      // await bingoGameContract.Bingo(txId);
      const difference = await getBalance();
      setIsPlayShow(true);
      setIsBingoShow(false);
      if (!difference) {
        alert("You got nothing");
      } else if (difference > 0) {
        alert(`Congratulations！！ You got ${difference} card`);
      } else if (difference < 0) {
        alert(`It’s a pity. You lost ${-difference} card`);
      }
    } catch (err) {
      console.log(err);
    }
  }, [getBalance]);

  return (
    <>
      <div className={styles.body}>
        <div className={styles.siteHeader}>
          <div className={styles.siteTitle}>Bingo Game</div>
          {isLoginShow && (
            <>
              <button
                className={styles.register}
                type="button"
                onClick={onLoginClick}
              >
                {registerTextMap[registerStatus]}
              </button>
              <br />
              {wallet && (
                <button
                  className={styles.register}
                  type="button"
                  onClick={() => {
                    setWallet(null);
                    history.go(0);
                  }}
                >
                  Logout
                </button>
              )}
            </>
          )}
        </div>

        {isSiteShow && (
          <div className={styles.siteBody}>
            <div className={styles.balance}>
              Your CARD: <span>{balanceValue}</span> CARD （Refresh page to
              restart）
            </div>
            <div className={styles.inputBox}>
              <input
                type="text"
                className={styles.inputWrap}
                value={balanceInputValue}
                placeholder="Please input amount"
                onChange={(e) => {
                  setBalanceInputValue(e.target.value);
                }}
              />
              <span
                className={[styles.inputBorder, styles.bottom].join(" ")}
              ></span>
              <span
                className={[styles.inputBorder, styles.right].join(" ")}
              ></span>
              <span
                className={[styles.inputBorder, styles.top].join(" ")}
              ></span>
              <span
                className={[styles.inputBorder, styles.left].join(" ")}
              ></span>
              <button
                type="button"
                className={styles.button}
                onClick={getBalance}
              >
                Get balance manually
              </button>
            </div>
            <div className={styles.buttonBox}>
              <button
                type="button"
                className={styles.button}
                onClick={() => {
                  setBalanceInputValue("3000");
                }}
              >
                3000
              </button>
              <button
                type="button"
                className={styles.button}
                onClick={() => {
                  setBalanceInputValue("5000");
                }}
              >
                5000
              </button>
              <button
                type="button"
                className={styles.button}
                onClick={() => {
                  setBalanceInputValue(
                    `${parseInt((Number(balanceValue) / 2).toString(), 10)}`
                  );
                }}
              >
                Half
              </button>
              <button
                type="button"
                className={styles.button}
                onClick={() => {
                  setBalanceInputValue(`${parseInt(balanceValue, 10)}`);
                }}
              >
                All-In
              </button>
            </div>
            <div>
              {isPlayShow && (
                <button className={styles.play} type="button" onClick={onPlay}>
                  Play
                </button>
              )}
            </div>
            <div>
              {isBingoShow && (
                <button className={styles.play} type="button" onClick={onBingo}>
                  Bingo
                </button>
              )}
            </div>
          </div>
        )}

        {isLoaderShow && (
          <div className={styles.loader}>
            <div className={styles.outer}></div>
            <div className={styles.middle}></div>
            <div className={styles.inner}></div>
          </div>
        )}

        <SignIn
          open={open}
          sandboxId="portkey-ui-sandbox"
          chainId={CHAIN_ID}
          onFinish={(wallet) => {
            setOpen(false);
            console.log(wallet, "onFinish===");
            walletRef.current = wallet;
            setWallet(wallet);
            initContract();
          }}
          onError={(err) => {
            console.error(err, "onError==");
          }}
          onCancel={() => {
            setOpen(false);
            setRegisterStatus(RegisterStatus.LOGIN);
          }}
        />
      </div>
    </>
  );
}
