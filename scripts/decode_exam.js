const zlib = require('zlib');

const sharedExam = "v2_H4sIAAAAAAAACo2VzWrbQBSFX-V2tlGMbVUJNXUNTRdZtKtmZxshy0IjsK5kaRTihixK1yX1plBCwW4IISGB0GZTadHFmLzH9EnKyLKj-K9a-Wc-695z5p7rYxKSGjnw-BiJQmxSI29FcuZDhSikT2rNZkUh-x4fITDKR0ihHw2gF4n4ltWI0jwmzDpipEaIQhzXsC1Sm77qFd3zmeOhbpR8tMmJUgDtFEfN4mh3irYVycwwvaL3IytMAd9gzAowxdqKVLwDZVChDFXYbeEeFclnhK6ILyLwKb_ygfFbpPL9b6AiOfdhMhTJJ6B5o_IkC_g1bvarWtyvanG_qgt-zU3IhL4XyRAaLWxhc5_fIAURnyMFFfqRiM9BJGcMTBrxe7RTjadtqMPOEl_ZyDeI0lxwX9WtfmRMRVi9nm_5vhWEuRt4lz6dUX5rUjD5CAKRDBkgFfEFe9bC1yIeS6tFcgrIrxEmQwcYtTwwPfnh4U4k39EG5COvkTd-8mV2FErtas6yvJMLWLUYVnmCLWh-rrvGByun8YDfuOBTEV8imPynlOOI-E-0eVC04oOiFR8UrXiwtM3B0nTXCUMHbd03AjZPWU53OnRmKnsydETyEeGQj7wsYfJKHTDlRbvQ4yMolUpLA0dF8s2HfsRHj2NWWWB6fAwm_zGAIwOpBNQFYPW0agsU47EDbNrm7Em7BRragv8W24bNDa8Izs48OKHuMMvNZ6ZShm34-3U8jWjqchag2ZLKmc3vgclMoT0zebnYrm74fs8K5zXzl-hByMdIa6DBFqhpXQ22ZaAeh_flmtjU13z_anV-spJ7_Beoab5N6rjTpSp3A1JFCr12s9OOMQAmkjOnNF_ea9b2oaSATnfN0o5WpRyoQ3lNt2oqvA47m1L_Qu84QTfUZQoDA02a8_DNw93DGO0WSmWuiC8G0En3mpyPK7ShIxUyKSfgYwdMkVwaGZL9tvG04fRsTbvaitPFP8WyblKn1w0s1HsOZsuqffIPvQxmGiYIAAA";

try {
    const base64 = sharedExam.substring(3).replace(/-/g, '+').replace(/_/g, '/');
    const buffer = Buffer.from(base64, 'base64');

    zlib.gunzip(buffer, (err, decompressed) => {
        if (err) {
            console.error('Error decompressing:', err);
            return;
        }
        const jsonString = decompressed.toString('utf8');
        console.log(jsonString);
    });
} catch (e) {
    console.error('Error:', e);
}
